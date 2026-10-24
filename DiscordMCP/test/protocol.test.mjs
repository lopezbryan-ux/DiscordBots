import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { ids } from "./fixture.mjs";

for (const mode of ["legacy", "auto"]) {
  test(
    `MCP ${mode} handshake, tool discovery, role/member inspection, matrix, and error isolation`,
    { timeout: 20_000 },
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
      try {
        await client.connect(transport);
        assert.equal(
          client.getProtocolEra(),
          mode === "auto" ? "modern" : "legacy",
        );
        const { tools } = await client.listTools();
        assert.equal(tools.length, 5);
        assert.ok(
          tools.every(
            (tool) =>
              tool.annotations.readOnlyHint === true &&
              tool.annotations.destructiveHint === false,
          ),
        );
        const call = async (name, args) => {
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
          5,
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
        assert.equal(stderr, "");
      } finally {
        await client.close();
      }
    },
  );
}
