# Discord Permissions MCP

A local MCP server for inspecting and managing Discord roles, channels, member role assignments, permission overwrites, and per-bot slash-command restrictions. It runs independently of StrengthBot and BookBot. Inspection tools only make GET requests; nine write tools support real changes and optional dry run previews. It does not connect to the Discord gateway or read messages.

This package lives in `DiscordBots/DiscordMCP`, alongside `StrengthBot` and
`BookBot`. It keeps its own dependencies, build, and ignored configuration.
See the [monorepo guide](../README.md) for root installation, build, and test
commands. Run the setup commands below from the DiscordBots root.

## Tools

| Tool                                  | Result                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| `discord_server_overview`             | Configured server IDs, selected server settings, role/channel counts                 |
| `discord_list_roles`                  | Role IDs, hierarchy, mentionability, bot roles, raw permission flags                 |
| `discord_list_channels`               | Categories/channels, category synchronization, optional permission overwrites        |
| `discord_inspect_permissions`         | Access for a role combination or real member; optional per-channel calculation trace |
| `discord_permission_matrix`           | Channel access comparison across role combinations, with pagination                  |
| `discord_create_role`                 | Create a role with named permissions, color, hoist, and mentionability               |
| `discord_update_role`                 | Edit a role and grant/revoke specific permissions while preserving other flags       |
| `discord_set_member_role`             | Assign or remove one role without replacing a member's other roles                   |
| `discord_create_channel`              | Create a text channel, voice channel, or category                                    |
| `discord_update_channel`              | Change name, topic, NSFW, slowmode, or parent category                               |
| `discord_set_channel_overwrite`       | Patch one role/member overwrite with allow, deny, or inherit values                  |
| `discord_delete_channel_overwrite`    | Remove one entire role/member overwrite, restoring inherited permissions             |
| `discord_list_command_applications`   | Configured bot/application IDs and OAuth configuration status; no credentials        |
| `discord_inspect_command_permissions` | Global/guild commands, application defaults, and individual command overrides        |
| `discord_set_command_permissions`     | Patch one application's or command's role/member/channel command permissions         |
| `discord_restrict_command_channels`   | Allow one application's or command's commands only in selected channels              |

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

Prefer a dedicated Discord application/bot and put its token in `DISCORD_BOT_TOKEN` in the ignored `.env`. Install that bot in each allowed server. Give it Manage Roles for role changes and member role assignment, Manage Channels for channel creation/updates, and View Channel plus Manage Roles in channels whose overwrites it should edit. Place its highest role above roles it should edit or assign. Administrator is not required.

Alternatively, set `DISCORD_ENV_FILE` to the absolute path of an existing bot's `.env` containing `DISCORD_TOKEN` or `DISCORD_BOT_TOKEN`. This shares that bot's identity and permissions. The external file is read without importing its other variables into the process environment. No additional bot invitation or privileged gateway intents are needed to inspect a server where that bot already has access. Remove `DISCORD_ENV_FILE` when switching to a dedicated token.

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

The server exports seven inspection tools and nine write tools. Reconnect your MCP client after rebuilding to discover new tools.

## Per-bot slash-command restrictions

These tools change Discord's application-command permissions, independently of bot
source code and other bots. They do not change the channel-wide Use Application
Commands flag. Discord requires a **user OAuth Bearer token for the selected
application**, authorized with `applications.commands.permissions.update`; a bot
token cannot perform these writes. This MCP also requests `identify` to verify
the authorized user's server permissions. See Discord's
[command permissions](https://docs.discord.com/developers/interactions/application-commands#permissions)
and [OAuth2 documentation](https://docs.discord.com/developers/topics/oauth2).

Configure the applications the MCP may manage:

```sh
mkdir -p .local
chmod 700 .local
cp -n command-applications.example.json .local/command-applications.json
chmod 600 .local/command-applications.json
```

Keep existing entries if this local JSON is already configured. For a new setup,
edit this ignored JSON to use each bot's actual application ID, its existing bot
environment file, and a separate OAuth file under `.local`. Relative credential
paths resolve against this JSON file. Add this to the MCP's ignored `.env`:

```dotenv
DISCORD_COMMAND_APPLICATIONS_FILE=.local/command-applications.json
```

The existing bot token and `CLIENT_ID` are read from each `botEnvFile` without
importing its other configuration. Its application identity is checked against
Discord on every inspection/update. A missing `oauthEnvFile` is allowed for
inspection and previews. The default MCP bot is also discoverable if its external
credential file supplies `CLIENT_ID`, or `DISCORD_APPLICATION_ID` is configured.
No tool accepts a token or client secret as an argument, and results never expose
credential values or file paths.

For each bot that needs live permission writes, register
`http://127.0.0.1:8765/callback` as an OAuth2 redirect in that application's Discord
Developer Portal. Create `.local/strengthbot-client.env` locally with that app's
`CLIENT_ID` and `CLIENT_SECRET`, and give it mode `600`. Never paste secrets into
chat, shell arguments, or Git. Then authorize:

```sh
npm run authorize:commands -- --client-env .local/strengthbot-client.env --output .local/strengthbot-oauth.env
```

The helper prints a Discord sign-in link and listens only on `127.0.0.1`. Complete
the sign-in as a user with Manage Server, Manage Roles, and permission to manage
the affected resources and run the commands. It verifies the OAuth app, scopes,
user, expiry, and callback state; tokens are saved atomically with mode `600` and
never printed. The callback times out after ten minutes. If using a browser on a
different computer, forward port 8765 to the Pi over SSH first. `--port` selects
another port, which must also be registered in the application's redirects.

Refresh an existing authorization using its saved refresh token:

```sh
npm run authorize:commands -- --client-env .local/strengthbot-client.env --output .local/strengthbot-oauth.env --refresh
```

Reconnect the MCP client after creating or refreshing credentials. Tokens are not
refreshed automatically. An expired or mismatched authorization blocks writes.

Use `discord_list_command_applications`, then inspect the selected app. For
example, preview restricting one bot using fictional IDs:

```json
{
  "guildId": "100000000000000001",
  "applicationId": "100000000000000030",
  "channelIds": ["100000000000000009"],
  "dryRun": true
}
```

Pass this to `discord_restrict_command_channels`. It replaces the selected scope's
channel entries with All Channels denied and the named channels allowed, while
preserving all role and member entries. Omit `commandId` for application defaults;
include it to update one global or guild command. Individual command overrides
remain intact and are listed as `explicitCommandPermissionIds`: inspect and
update those commands separately if they also need the restriction. Up to 100
total permission entries are supported. All Channels uses the exact string value
`guild_id - 1`, calculated without JavaScript number rounding.

`discord_set_command_permissions` patches named targets using `allow`, `deny`, or
`inherit`. Set `targetType` to `role`, `member`, or `channel` with `targetId`, or
use `allChannels` without a target ID. Unmentioned entries are preserved. An
unchanged request does not issue a PUT. Writes are serialized with other writes
for the server in this process; external administrators can still change state.

Previews without OAuth report `authorization.verified: false` and make no writes;
they do not establish that a future OAuth user is authorized. With OAuth, the MCP
checks the application, scopes, expiry, user's Manage Server/Manage Roles access,
and View Channel/Manage Channels for changed channels (all channels when changing
an All Channels rule). Discord also checks the ability to run the command and
manage the affected resources. Read results include the observed permission
records, not a complete calculation of command availability for a member.

Discord administrators bypass command restrictions. Channel command rules apply
to threads inside that channel. These settings apply to the server installation;
they do not restrict direct messages or separate user installations. Channel
access and a command's default member permissions still apply. Command deletion
or renaming can remove its individual permission rules. No cross-command bulk
write or transaction is implied, and ambiguous failures require inspection before
retrying. These tools do not expose the role/channel tools' audit `reason`.

## Write tools

Write tools apply changes immediately by default (`dryRun: false`). Set `dryRun: true` to validate permissions and return the proposed change without issuing a POST, PATCH, PUT, or DELETE. Previews are observations, not reservations: another administrator can change permissions before a subsequent write. Each write accepts an optional `reason` (up to 512 characters) for Discord's audit log, and returns `before`, `proposed`, `after`, and `applied`. A satisfied member assignment or absent overwrite deletion is a no-op with `applied: false`.

Use discord.js permission names such as `ViewChannel`, `SendMessages`, and `ManageChannels`. New roles default to no explicit permissions. Role updates use `grantPermissions` and `revokePermissions` to preserve all other bits, including unknown future flags. Overwrite updates similarly preserve unmentioned flags; `inherit` clears the named flag from both allow and deny. For example, preview opening a channel to a role using fictional IDs:

```json
{
  "guildId": "100000000000000001",
  "channelId": "100000000000000009",
  "targetType": "role",
  "targetId": "100000000000000004",
  "changes": [{ "permission": "ViewChannel", "value": "allow" }],
  "dryRun": true,
  "reason": "Open the reading room to members"
}
```

Pass this to `discord_set_channel_overwrite`. `discord_delete_channel_overwrite` removes the target's entire overwrite. Category overwrite results identify currently synchronized child channels that Discord may also update. Moving a channel with `discord_update_channel` preserves its existing overwrites; `parentId: null` removes its parent.

The role/channel write tools recheck the server allowlist, target membership, current bot permissions, and applicable role hierarchy. Managed roles cannot be edited or assigned, and Administrator does not bypass role hierarchy. Editing @everyone supports permission changes only. Overwrites follow Discord's channel permission rules rather than role hierarchy. Discord remains authoritative about additional restrictions and concurrent changes. Writes from this process are serialized per server; it cannot serialize external administrators or other clients. Command-permission tools use the separate OAuth checks described above.

Channel and role creation are not idempotent. Automatic retries after server errors are disabled; inspect the server before retrying an uncertain creation. Tool annotations distinguish inspection, creation, and potentially destructive updates. Tool annotations are metadata, not an authorization boundary.

## Permission semantics

The calculation follows [Discord's documented permission order](https://docs.discord.com/developers/topics/permissions): `@everyone` plus assigned roles, owner/Administrator bypass, channel `@everyone` overwrite, combined role overwrites, then member overwrite. Role allows win conflicts at the combined-role stage; hierarchy does not resolve those conflicts. Active member timeouts are applied after overwrites.

Channel overwrites returned by Discord are authoritative. A child synced to a category has matching overwrites; an unsynced child keeps its own configuration. The calculation does not apply category denies a second time.

Raw bitfields are reported separately from usable capabilities. A missing View Channel permission gates reading/sending; missing Send Messages gates attachments, embeds, and broad mentions. Categories have no posting capability; forums report `createForumPosts`; voice channels report Connect and Speak permission. A role combination always includes `@everyone`. A real member lookup additionally includes personal overrides, ownership, and timeout state.

The channel-capability reports cover normal guild channels and categories. Threads, private thread membership, slowmode, archived/locked state, and stage suppression are outside their scope. App-specific command permission records are available through the separate command tools; they are not merged into the channel-capability calculation. The Use Application Commands flag alone does not establish whether an individual slash command will work. Role hierarchy and target-member checks further constrain management actions. Unknown future permission bits remain in the raw bitfield but require an updated discord.js version to gain names.

Every tool fetches fresh configuration; a multi-request snapshot is not an atomic transaction. Discord-provided names are untrusted data. Upstream error details and credentials are excluded from errors and tool results.

## Verification

```sh
npm test
npm run format:check
npm run test:live
```

Offline tests cover permission conflicts, member overrides, owner/Administrator bypass, timeouts, implicit permissions, category synchronization, configuration, error redaction, and actual MCP stdio connections in both legacy and modern negotiation modes. Write tests use a fake Discord API to verify all seven actions, dry runs, audit reasons, partial permission updates, server/target scope, hierarchy, privilege restrictions, and serialization. The raw overwrite calculation is compared with discord.js across 100 deterministic combinations.

Command tests additionally cover OAuth application binding, scopes, expiry, user permissions, missing authorization, inheritance, app defaults, command overrides, global/guild commands, preservation of unrelated rules, serialization, and redaction. The authorization helper is tested with mocked exchanges and loopback callbacks, including invalid states, denial, timeouts, and private atomic token storage.

`test:live` uses the first allowed server, or `DISCORD_TEST_GUILD` if set. It exercises the inspection tools and previews each write action permitted by the bot's current access and hierarchy. It inspects configured applications and previews both command-permission writes, confirming command permissions remain unchanged. Unavailable previews are listed as skipped. It verifies the server allowlist, owner inspection, and unchanged roles/channels, then writes an ignored report to `.local/live-check.json`. It samples up to six actual custom roles and their combinations (up to twelve columns), and verifies matrix results against individual inspections. The channel configuration comparison excludes message and pin activity metadata; every other returned channel field and all permission overwrites are compared. Changed field names are recorded in an ignored diagnostic report. It sends no messages and makes no Discord writes.
