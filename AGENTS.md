# DiscordBots

This is one Git repository containing independent Node.js packages:
`StrengthBot`, `BookBot`, and `DiscordMCP`. Do not initialize nested repositories.
Keep each package's manifest, lockfile, dependency installation, configuration,
and build output separate. Root scripts orchestrate the package commands.

Read the package README and its agent or deployment instructions before editing
it. Root `npm run build` builds all packages; root `npm test` runs deployment,
BookBot, and DiscordMCP tests. StrengthBot currently has no test suite.

Keep tokens, real Discord IDs in examples, `.env` files, database snapshots,
local reports, and PM2 dumps out of commits. Use fictional IDs in fixtures and
documentation. Never print credential values or full PM2 environments.

Both live bots use the root `ecosystem.config.js`. Their `cleanrun` scripts call
`scripts/run-bot.sh`, which serializes pull/build/command registration before
launching the selected bot. Deploy or restart only the bot requested. Follow its
`SKILL.md`; the permission MCP is launched by its client and is not a PM2 app.

BookBot's canonical source is `BookBot/` in this repository. Its original
standalone checkout is a rollback copy, not the place for new changes.
