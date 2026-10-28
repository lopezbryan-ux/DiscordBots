import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { ids } from "./ids.mjs";
import { applicationId } from "./command-fixture.mjs";

for (const mode of ["legacy", "auto"]) {
  test(
    `MCP ${mode} handshake, inspection, all write tools, and error isolation`,
    { timeout: 60_000 },
    async () => {
      let stderr = "";
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [fileURLToPath(new URL("./fixture-server.mjs", import.meta.url))],
        stderr: "pipe",
      });
      transport.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      const client = new Client(
        { name: "discord-mcp-test", version: "1" },
        { versionNegotiation: { mode } },
      );
      let stage = "connection";
      try {
        await client.connect(transport);
        assert.equal(
          client.getProtocolEra(),
          mode === "auto" ? "modern" : "legacy",
        );
        stage = "tool discovery";
        const { tools } = await client.listTools();
        assert.equal(tools.length, 16);
        assert.ok(
          tools
            .filter((tool) => tool.annotations.readOnlyHint)
            .every(
              (tool) =>
                tool.annotations.readOnlyHint === true &&
                tool.annotations.destructiveHint === false,
            ),
        );
        const writes = tools.filter((tool) => !tool.annotations.readOnlyHint);
        assert.equal(writes.length, 9);
        assert.ok(writes.every((tool) => tool.annotations.openWorldHint));
        assert.equal(
          writes.find((tool) => tool.name === "discord_create_role").annotations
            .idempotentHint,
          false,
        );
        assert.equal(
          writes.find((tool) => tool.name === "discord_update_role").annotations
            .destructiveHint,
          true,
        );
        const call = async (name, args) => {
          stage = name;
          const value = await client.callTool({ name, arguments: args });
          assert.equal(value.isError, undefined, JSON.stringify(value));
          return value.structuredContent ?? JSON.parse(value.content[0].text);
        };
        assert.deepEqual(
          (await call("discord_server_overview", {})).configuredServerIds,
          [ids.guild],
        );
        assert.equal(
          (await call("discord_list_roles", { guildId: ids.guild })).roles
            .length,
          6,
        );
        const channels = await call("discord_list_channels", {
          guildId: ids.guild,
          includeOverwrites: true,
        });
        assert.equal(channels.channels[2].overwrites[0].id, ids.member);
        const roles = await call("discord_inspect_permissions", {
          guildId: ids.guild,
          roleIds: [ids.demon],
          channelId: ids.general,
        });
        assert.equal(roles.capabilities.viewChannel, true);
        const member = await call("discord_inspect_permissions", {
          guildId: ids.guild,
          memberId: ids.member,
          channelId: ids.general,
        });
        assert.equal(member.capabilities.viewChannel, false);
        const matrix = await call("discord_permission_matrix", {
          guildId: ids.guild,
          groups: [
            { label: "@everyone", roleIds: [] },
            { label: "Demon", roleIds: [ids.demon] },
          ],
          limit: 1,
        });
        assert.equal(matrix.rows.length, 1);
        assert.equal(matrix.nextOffset, 1);
        const page = await call("discord_permission_matrix", {
          guildId: ids.guild,
          groups: [{ label: "Demon", roleIds: [ids.demon] }],
          offset: 1,
        });
        assert.equal(page.rows[0].channel.id, ids.general);
        const badRole = await client.callTool({
          name: "discord_inspect_permissions",
          arguments: { guildId: ids.guild, roleIds: ["99999999999999999"] },
        });
        assert.equal(badRole.isError, true);
        const both = await client.callTool({
          name: "discord_inspect_permissions",
          arguments: { guildId: ids.guild, roleIds: [], memberId: ids.member },
        });
        assert.equal(both.isError, true);
        const wrongChannel = await client.callTool({
          name: "discord_inspect_permissions",
          arguments: { guildId: ids.guild, channelId: "99999999999999999" },
        });
        assert.equal(wrongChannel.isError, true);
        const upstream = await client.callTool({
          name: "discord_list_roles",
          arguments: { guildId: "99999999999999999" },
        });
        assert.equal(upstream.isError, true);
        assert.ok(!JSON.stringify(upstream).includes("sensitive-token"));
        const invalid = await client.callTool({
          name: "discord_list_roles",
          arguments: { guildId: "invalid" },
        });
        assert.equal(invalid.isError, true);
        assert.match(invalid.content[0].text, /validation|invalid/i);

        const preview = await call("discord_create_role", {
          guildId: ids.guild,
          name: "Preview",
          dryRun: true,
        });
        assert.equal(preview.applied, false);
        assert.equal(
          (await call("discord_list_roles", { guildId: ids.guild })).roles
            .length,
          6,
        );
        const createdRole = await call("discord_create_role", {
          guildId: ids.guild,
          name: "Readers",
          permissions: ["ViewChannel"],
          reason: "Test role",
        });
        assert.equal(createdRole.applied, true);
        const roleId = createdRole.after.id;
        const updatedRole = await call("discord_update_role", {
          guildId: ids.guild,
          roleId,
          name: "Book readers",
          grantPermissions: ["SendMessages"],
        });
        assert.equal(updatedRole.after.name, "Book readers");
        const assigned = await call("discord_set_member_role", {
          guildId: ids.guild,
          memberId: ids.member,
          roleId,
          assigned: true,
        });
        assert.equal(assigned.after.assigned, true);
        const createdChannel = await call("discord_create_channel", {
          guildId: ids.guild,
          name: "books",
          parentId: ids.category,
        });
        const channelId = createdChannel.after.id;
        const updatedChannel = await call("discord_update_channel", {
          guildId: ids.guild,
          channelId,
          topic: "Book discussions",
          slowmodeSeconds: 10,
        });
        assert.equal(updatedChannel.after.topic, "Book discussions");
        const overwrite = await call("discord_set_channel_overwrite", {
          guildId: ids.guild,
          channelId,
          targetType: "role",
          targetId: roleId,
          changes: [{ permission: "ViewChannel", value: "allow" }],
        });
        assert.equal(overwrite.applied, true);
        const removed = await call("discord_delete_channel_overwrite", {
          guildId: ids.guild,
          channelId,
          targetType: "role",
          targetId: roleId,
        });
        assert.equal(removed.after, null);
        const writeFailure = await client.callTool({
          name: "discord_create_role",
          arguments: { guildId: ids.guild, name: "upstream-error" },
        });
        assert.equal(writeFailure.isError, true);
        assert.ok(!JSON.stringify(writeFailure).includes("sensitive-token"));
        const invalidWrite = await client.callTool({
          name: "discord_set_channel_overwrite",
          arguments: {
            guildId: ids.guild,
            channelId,
            targetType: "role",
            targetId: roleId,
            changes: [{ permission: "InvalidPermission", value: "allow" }],
          },
        });
        assert.equal(invalidWrite.isError, true);
        assert.equal(
          (
            await call("discord_list_command_applications", {
              guildId: ids.guild,
            })
          ).applications[0].applicationId,
          applicationId,
        );
        const commandPermissions = await call(
          "discord_inspect_command_permissions",
          { guildId: ids.guild, applicationId },
        );
        assert.equal(commandPermissions.commands.length, 2);
        const commandPreview = await call("discord_restrict_command_channels", {
          guildId: ids.guild,
          applicationId,
          channelIds: [ids.general],
          dryRun: true,
        });
        assert.equal(commandPreview.applied, false);
        assert.equal(commandPreview.authorization.verified, true);
        assert.equal(
          (
            await call("discord_restrict_command_channels", {
              guildId: ids.guild,
              applicationId,
              channelIds: [ids.general],
            })
          ).applied,
          true,
        );
        const commandPatch = await call("discord_set_command_permissions", {
          guildId: ids.guild,
          applicationId,
          changes: [{ targetType: "allChannels", value: "inherit" }],
        });
        assert.equal(commandPatch.applied, true);
        const invalidCommand = await client.callTool({
          name: "discord_restrict_command_channels",
          arguments: {
            guildId: ids.guild,
            applicationId,
            channelIds: [ids.general],
            token: "sensitive-token",
          },
        });
        assert.equal(invalidCommand.isError, true);
        assert.equal(stderr, "");
      } catch (error) {
        throw new Error(
          `MCP ${stage} failed; fixture stderr: ${stderr || "(empty)"}`,
          { cause: error },
        );
      } finally {
        await client.close();
      }
    },
  );
}
