# Discord Permissions MCP

A local MCP server for inspecting Discord roles, channels, and effective permissions. It runs independently of StrengthBot and BookBot and makes **GET requests only**. It does not connect to the Discord gateway, read messages, or change server configuration.

This package lives in `DiscordBots/DiscordMCP`, alongside `StrengthBot` and
`BookBot`. It keeps its own dependencies, build, and ignored configuration.
See the [monorepo guide](../README.md) for root installation, build, and test
commands. Run the setup commands below from the DiscordBots root.

## Tools

| Tool                          | Result                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `discord_server_overview`     | Configured server IDs, selected server settings, role/channel counts                 |
| `discord_list_roles`          | Role IDs, hierarchy, mentionability, bot roles, raw permission flags                 |
| `discord_list_channels`       | Categories/channels, category synchronization, optional permission overwrites        |
| `discord_inspect_permissions` | Access for a role combination or real member; optional per-channel calculation trace |
| `discord_permission_matrix`   | Channel access comparison across role combinations, with pagination                  |

For example, compare `@everyone`, `Demon`, `Smiters`, and `Demon + Smiters`. Role names are display data; tool inputs use IDs returned by `discord_list_roles`.

## Setup

Requires Node.js 20 or later.

```sh
cd DiscordMCP
npm ci
npm run build
cp .env.example .env
chmod 600 .env
```

Set `DISCORD_ALLOWED_GUILDS` to the comma-separated IDs of servers this MCP may inspect. It is required: omitted, empty, and wildcard values are rejected. The bot must already be a member of each server.

Provide either `DISCORD_BOT_TOKEN` in the ignored `.env`, or set `DISCORD_ENV_FILE` to the absolute path of an existing bot's `.env` containing `DISCORD_TOKEN` or `DISCORD_BOT_TOKEN`. The external file is read without importing its other variables into the process environment. No additional bot invitation or privileged gateway intents are needed to inspect a server where that bot already has access.

To reuse the sibling BookBot package's credentials, point the local setting at
the monorepo checkout, for example:

```dotenv
DISCORD_ENV_FILE=/absolute/path/to/DiscordBots/BookBot/.env
```

Use the canonical `BookBot/.env` in this checkout when retaining a standalone
Book-Bot checkout for rollback.

The configuration file defaults to `DiscordMCP/.env`, resolved relative to the built executable rather than the caller's current directory. `DISCORD_MCP_CONFIG` can select another file. Process environment variables override local configuration; an explicit token overrides an external token.

## Connect to Codex

After building, register the absolute path to the executable:

```sh
codex mcp add discord-permissions -- node /absolute/path/to/DiscordBots/DiscordMCP/dist/index.js
```

`codex mcp get discord-permissions` shows the registration. Reload the client or start a new session to discover its tools. The MCP client launches the process when needed, so PM2 is not required. Other MCP clients can use the same command and argument. See [Codex MCP configuration](https://developers.openai.com/codex/mcp).

Example requests once connected:

- “List my Discord server's roles and channel overrides.”
- “Show which channels @everyone can see.”
- “Compare Demon with Demon plus Smiters.”
- “Explain why this member can view this channel.”

The server exports five read-only tools. Adding write tools is a separate extension.

## Permission semantics

The calculation follows [Discord's documented permission order](https://docs.discord.com/developers/topics/permissions): `@everyone` plus assigned roles, owner/Administrator bypass, channel `@everyone` overwrite, combined role overwrites, then member overwrite. Role allows win conflicts at the combined-role stage; hierarchy does not resolve those conflicts. Active member timeouts are applied after overwrites.

Channel overwrites returned by Discord are authoritative. A child synced to a category has matching overwrites; an unsynced child keeps its own configuration. The calculation does not apply category denies a second time.

Raw bitfields are reported separately from usable capabilities. A missing View Channel permission gates reading/sending; missing Send Messages gates attachments, embeds, and broad mentions. Categories have no posting capability; forums report `createForumPosts`; voice channels report Connect and Speak permission. A role combination always includes `@everyone`. A real member lookup additionally includes personal overrides, ownership, and timeout state.

These reports cover normal guild channels and categories. Threads, private thread membership, slowmode, archived/locked state, stage suppression, and app-specific command restrictions are outside their scope. The Use Application Commands flag alone does not establish whether an individual slash command will work. Role hierarchy and target-member checks further constrain management actions. Unknown future permission bits remain in the raw bitfield but require an updated discord.js version to gain names.

Every tool fetches fresh configuration; a multi-request snapshot is not an atomic transaction. Discord-provided names are untrusted data. Upstream error details and credentials are excluded from errors and tool results.

## Verification

```sh
npm test
npm run format:check
npm run test:live
```

Offline tests cover permission conflicts, member overrides, owner/Administrator bypass, timeouts, implicit permissions, category synchronization, configuration, error redaction, and actual MCP stdio connections in both legacy and modern negotiation modes. The raw overwrite calculation is compared with discord.js across 100 deterministic combinations.

`test:live` uses the first allowed server, or `DISCORD_TEST_GUILD` if set, and exercises all five tools against Discord. It verifies the server allowlist, owner inspection, and unchanged roles/channels, then writes an ignored report to `.local/live-check.json`. It samples up to six actual custom roles and their combinations (up to twelve columns), and verifies matrix results against individual inspections. It sends no messages and changes no permissions.
