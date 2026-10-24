import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { createSource } from "../dist/discord.js";
import { readConfig, safeError } from "../dist/config.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const config = readConfig();
const guildId = process.env.DISCORD_TEST_GUILD ?? config.guildIds[0];
const source = createSource(config.token, config.guildIds);
const before = await source.snapshot(guildId);
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
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 5);
  assert.ok(tools.every((tool) => tool.annotations.readOnlyHint));
  const call = async (name, args) => {
    stage = name;
    const value = await client.callTool({ name, arguments: args });
    assert.ok(
      !JSON.stringify(value).includes(config.token),
      "Token must not appear in any tool response",
    );
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
  }
  stage = "unchanged server configuration";
  const after = await source.snapshot(guildId);
  assert.deepEqual(after.roles, before.roles, "Server roles must be unchanged");
  assert.deepEqual(
    after.channels,
    before.channels,
    "Server channels must be unchanged",
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
