import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { createSource } from "../dist/discord.js";
import { readConfig, safeError } from "../dist/config.js";
import { REST, Routes, PermissionFlagsBits as P } from "discord.js";
import { calculatePermissions, targetFromMember } from "../dist/permissions.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const config = readConfig();
const guildId = process.env.DISCORD_TEST_GUILD ?? config.guildIds[0];
const source = createSource(config.token, config.guildIds, config.applications);
function channelConfiguration(channels) {
  return channels
    .map((channel) => {
      // Message/pin activity is not channel configuration. Keep every other field,
      // including all overwrites, names, topics, flags, positions and parents.
      const {
        last_message_id,
        last_pin_timestamp,
        message_count,
        member_count,
        total_message_sent,
        ...configuration
      } = channel;
      if (configuration.permission_overwrites)
        configuration.permission_overwrites = [
          ...configuration.permission_overwrites,
        ].sort((a, b) =>
          `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`),
        );
      return configuration;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
let before;
let stderr = "";
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL("../dist/index.js", import.meta.url))],
  cwd: root,
  // Only pass the MCP configuration it needs; never put a token in argv.
  env: Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => key.startsWith("DISCORD_") && value !== undefined,
    ),
  ),
  stderr: "pipe",
});
transport.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});
const client = new Client({ name: "discord-live-check", version: "1" });
let stage = "MCP connection";
try {
  stage = "initial server snapshot";
  before = await source.snapshot(guildId);
  stage = "MCP connection";
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 16);
  assert.equal(tools.filter((tool) => tool.annotations.readOnlyHint).length, 7);
  assert.equal(
    tools.filter((tool) => !tool.annotations.readOnlyHint).length,
    9,
  );
  const call = async (name, args) => {
    stage = name;
    const value = await client.callTool({ name, arguments: args });
    assert.ok(
      !JSON.stringify(value).includes(config.token),
      "Token must not appear in any tool response",
    );
    for (const app of config.applications) {
      for (const token of [app.botToken, app.oauthToken].filter(Boolean)) {
        assert.ok(
          !JSON.stringify(value).includes(token),
          "Application credentials must not appear in tool responses",
        );
      }
    }
    assert.ok(
      !value.isError,
      `Tool ${name} failed: ${value.isError ? value.content[0]?.text : ""}`,
    );
    return value.structuredContent ?? JSON.parse(value.content[0].text);
  };
  const configured = await call("discord_server_overview", {});
  assert.ok(configured.configuredServerIds.includes(guildId));
  const overview = await call("discord_server_overview", { guildId });
  const roles = await call("discord_list_roles", { guildId });
  const channels = await call("discord_list_channels", {
    guildId,
    includeOverwrites: true,
  });
  assert.equal(roles.roles.length, before.roles.length);
  assert.equal(channels.channels.length, before.channels.length);
  const everyone = await call("discord_inspect_permissions", {
    guildId,
    roleIds: [],
  });
  const owner = await call("discord_inspect_permissions", {
    guildId,
    memberId: before.guild.owner_id,
    channelId: before.channels[0].id,
  });
  assert.equal(owner.owner, true);
  const groups = [{ label: "@everyone", roleIds: [] }];
  const customRoles = roles.roles
    .filter((role) => !role.managed && role.id !== guildId)
    .slice(0, 6);
  for (const role of customRoles)
    groups.push({ label: role.name, roleIds: [role.id] });
  for (let i = 0; i < customRoles.length; i++) {
    for (let j = i + 1; j < customRoles.length && groups.length < 12; j++) {
      groups.push({
        label: `${customRoles[i].name} + ${customRoles[j].name}`.slice(0, 80),
        roleIds: [customRoles[i].id, customRoles[j].id],
      });
    }
  }
  const matrix = await call("discord_permission_matrix", {
    guildId,
    groups,
    limit: 100,
  });
  stage = "matrix versus everyone inspection";
  for (const row of matrix.rows) {
    const existing = everyone.channels.find(
      (channel) => channel.id === row.channel.id,
    );
    assert.deepEqual(row.access[0], existing.capabilities);
  }
  // Verify each matrix column against the standalone inspector as well.
  // These are configuration observations, not assumptions about role names.
  for (let i = 1; i < groups.length; i++) {
    const inspection = await call("discord_inspect_permissions", {
      guildId,
      roleIds: groups[i].roleIds,
    });
    for (const row of matrix.rows) {
      const channel = inspection.channels.find(
        (channel) => channel.id === row.channel.id,
      );
      stage = `matrix comparison for group ${i}`;
      assert.deepEqual(row.access[i], channel.capabilities);
    }
  }
  const blockedGuildId = "99999999999999999";
  if (!config.guildIds.includes(blockedGuildId)) {
    const blocked = await client.callTool({
      name: "discord_list_roles",
      arguments: { guildId: blockedGuildId },
    });
    assert.equal(blocked.isError, true);
    assert.match(blocked.content[0].text, /DISCORD_ALLOWED_GUILDS/);
    const blockedWrite = await client.callTool({
      name: "discord_create_role",
      arguments: {
        guildId: blockedGuildId,
        name: "MCP preview only",
        dryRun: true,
      },
    });
    assert.equal(blockedWrite.isError, true);
    assert.match(blockedWrite.content[0].text, /DISCORD_ALLOWED_GUILDS/);
  }
  stage = "write tool dry runs";
  const rest = new REST({ version: "10", timeout: 15000, retries: 0 }).setToken(
    config.token,
  );
  const bot = await rest.get(Routes.user("@me"));
  const botMember = await source.member(guildId, bot.id);
  const target = targetFromMember(bot.id, botMember);
  const botPermissions = BigInt(
    calculatePermissions(before, target).rawPermissions,
  );
  const compareRoles = (a, b) =>
    a.position - b.position || Number(BigInt(b.id) - BigInt(a.id));
  const highest = before.roles
    .filter((role) => role.id === guildId || botMember.roles.includes(role.id))
    .reduce((top, role) => (compareRoles(role, top) > 0 ? role : top));
  const editableRole = before.roles.find(
    (role) =>
      role.id !== guildId && !role.managed && compareRoles(role, highest) < 0,
  );
  const manageableChannel = before.channels.find((channel) => {
    const result = calculatePermissions(before, target, channel);
    return (
      result.capabilities.viewChannel &&
      (BigInt(result.rawPermissions) & P.ManageChannels) !== 0n
    );
  });
  const permissionsChannel = before.channels.find((channel) => {
    const result = calculatePermissions(before, target, channel);
    return (
      result.capabilities.viewChannel &&
      (BigInt(result.rawPermissions) & P.ManageRoles) !== 0n
    );
  });
  const previews = [];
  if (botPermissions & P.ManageRoles) {
    previews.push([
      "discord_create_role",
      { name: "MCP preview only", permissions: [] },
    ]);
    if (editableRole) {
      previews.push([
        "discord_update_role",
        { roleId: editableRole.id, name: editableRole.name },
      ]);
      previews.push([
        "discord_set_member_role",
        {
          memberId: bot.id,
          roleId: editableRole.id,
          assigned: botMember.roles.includes(editableRole.id),
        },
      ]);
    }
  }
  if (botPermissions & P.ManageChannels)
    previews.push([
      "discord_create_channel",
      { name: "mcp-preview-only", type: "text" },
    ]);
  if (manageableChannel)
    previews.push([
      "discord_update_channel",
      { channelId: manageableChannel.id, name: manageableChannel.name },
    ]);
  if (permissionsChannel) {
    const overwrite = permissionsChannel.permission_overwrites?.find(
      (entry) => entry.id === guildId && entry.type === 0,
    );
    const value =
      overwrite && (BigInt(overwrite.allow) & P.ViewChannel) !== 0n
        ? "allow"
        : overwrite && (BigInt(overwrite.deny) & P.ViewChannel) !== 0n
          ? "deny"
          : "inherit";
    previews.push([
      "discord_set_channel_overwrite",
      {
        channelId: permissionsChannel.id,
        targetId: guildId,
        targetType: "role",
        changes: [{ permission: "ViewChannel", value }],
      },
    ]);
    previews.push([
      "discord_delete_channel_overwrite",
      {
        channelId: permissionsChannel.id,
        targetId: guildId,
        targetType: "role",
      },
    ]);
  }
  const writePreviews = [];
  for (const [name, args] of previews) {
    const preview = await call(name, {
      ...args,
      guildId,
      dryRun: true,
      reason: "MCP live verification (dry run)",
    });
    assert.equal(preview.dryRun, true);
    assert.equal(preview.applied, false);
    writePreviews.push(name);
  }
  const configuredApplications = await call(
    "discord_list_command_applications",
    { guildId },
  );
  const commandPreviews = [];
  for (const app of configuredApplications.applications) {
    const inspected = await call("discord_inspect_command_permissions", {
      guildId,
      applicationId: app.applicationId,
    });
    const channel = before.channels.find((channel) => channel.type === 0);
    if (channel) {
      const preview = await call("discord_restrict_command_channels", {
        guildId,
        applicationId: app.applicationId,
        channelIds: [channel.id],
        dryRun: true,
      });
      assert.equal(preview.applied, false);
      assert.equal(preview.dryRun, true);
      const patchPreview = await call("discord_set_command_permissions", {
        guildId,
        applicationId: app.applicationId,
        changes: [{ targetType: "allChannels", value: "inherit" }],
        dryRun: true,
      });
      assert.equal(patchPreview.applied, false);
      const afterCommands = await call("discord_inspect_command_permissions", {
        guildId,
        applicationId: app.applicationId,
      });
      assert.deepEqual(
        afterCommands.applicationPermissions,
        inspected.applicationPermissions,
        "App defaults must remain unchanged",
      );
      assert.deepEqual(
        afterCommands.commands,
        inspected.commands,
        "Command permission records must remain unchanged",
      );
      commandPreviews.push({
        applicationId: app.applicationId,
        name: app.name,
        commands: inspected.commands.length,
        oauthConfigured: app.oauthConfigured,
        oauthVerified: preview.authorization.verified,
        unchanged: true,
      });
    }
  }
  stage = "unchanged server configuration";
  const after = await source.snapshot(guildId);
  const channelChanges = before.channels.flatMap((channel) => {
    const next = after.channels.find((entry) => entry.id === channel.id);
    return next
      ? [
          {
            id: channel.id,
            fields: [
              ...new Set([...Object.keys(channel), ...Object.keys(next)]),
            ].filter(
              (key) =>
                JSON.stringify(channel[key]) !== JSON.stringify(next[key]),
            ),
          },
        ].filter((entry) => entry.fields.length)
      : [{ id: channel.id, fields: ["removed"] }];
  });
  for (const channel of after.channels.filter(
    (channel) => !before.channels.some((entry) => entry.id === channel.id),
  ))
    channelChanges.push({ id: channel.id, fields: ["added"] });
  await mkdir(new URL("../.local/", import.meta.url), { recursive: true });
  await writeFile(
    new URL("../.local/live-command-check.json", import.meta.url),
    JSON.stringify(
      { verifiedAt: new Date().toISOString(), commandPreviews, channelChanges },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  assert.deepEqual(after.roles, before.roles, "Server roles must be unchanged");
  assert.deepEqual(
    channelConfiguration(after.channels),
    channelConfiguration(before.channels),
    "Server channel configuration must be unchanged",
  );
  assert.equal(stderr, "");
  const report = {
    verifiedAt: new Date().toISOString(),
    server: overview.server,
    tools: tools.map((tool) => tool.name),
    roleCount: roles.roles.length,
    channelCount: channels.channels.length,
    visibleToEveryone: everyone.channels
      .filter((channel) => channel.capabilities.viewChannel)
      .map((channel) => channel.name),
    roleSummary: roles.roles.map(({ id, name, mentionable, permissions }) => ({
      id,
      name,
      mentionable,
      permissions,
    })),
    ownerBypassVerified: true,
    disallowedServerBlocked: true,
    rolesAndChannelsUnchanged: true,
    writePreviews,
    commandPreviews,
    channelChanges,
    skippedWritePreviews: tools
      .filter(
        (tool) =>
          !tool.annotations.readOnlyHint &&
          !writePreviews.includes(tool.name) &&
          !(
            commandPreviews.length &&
            [
              "discord_set_command_permissions",
              "discord_restrict_command_channels",
            ].includes(tool.name)
          ),
      )
      .map((tool) => tool.name),
    matrix,
  };
  await mkdir(new URL("../.local/", import.meta.url), { recursive: true });
  await writeFile(
    new URL("../.local/live-check.json", import.meta.url),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify(
      {
        server: report.server,
        tools: report.tools.length,
        roles: report.roleCount,
        channels: report.channelCount,
        visibleToEveryone: report.visibleToEveryone,
        groups: groups.map((group) => group.label),
        writePreviews: report.writePreviews.length,
        commandPreviews: report.commandPreviews,
        skippedWritePreviews: report.skippedWritePreviews,
        unchanged: true,
        report: ".local/live-check.json",
      },
      null,
      2,
    ),
  );
} catch (error) {
  const diagnostic =
    error instanceof assert.AssertionError
      ? error.message.split("\n")[0]
      : safeError(error);
  console.error(`${stage}: ${diagnostic}`);
  process.exitCode = 1;
} finally {
  await client.close();
}
