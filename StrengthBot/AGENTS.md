# StrengthBot agent guide

StrengthBot is the `DiscordBots/StrengthBot` package in the monorepo. Follow the
[root agent instructions](../AGENTS.md). Source lives in `src`, compiled output
goes to `dist`, and package commands are defined in `package.json`.

## Package commands

Run these from `StrengthBot/`:

- `npm ci` installs the locked dependencies.
- `npm run build` compiles TypeScript.
- `npm run format` formats source files; `npm run format:check` checks them.
- `npm run deploy-commands` registers the compiled commands in configured servers.
- `npm start` runs the compiled bot.

There is currently no `lint` or `test` npm script in this package. From the
repository root, `npm run build:strengthbot` builds this package and `npm test`
runs the deployment, BookBot, and DiscordMCP suites.

Keep credentials in the ignored package `.env`. Command deployment accepts
comma-separated `GUILD_IDS`, with `GUILD_ID` as the legacy fallback. On Windows,
use `npm.cmd` if PowerShell blocks `npm.ps1`.

## Deployment

Follow [the PM2 workflow](SKILL.md) for an authorized start, restart, or deploy.
The package's `cleanrun` invokes the shared `scripts/run-bot.sh StrengthBot`,
which requires Bash and `flock` on the Pi. Run ecosystem-file commands from the
monorepo root and restart only the requested bot.

## Editing and verification

Check Git status first and preserve unrelated changes. Follow the existing
TypeScript organization and edit source rather than generated `dist` files.
Format changed files, run the TypeScript build when source changes, and report
the checks performed. Keep secrets, logs, and local machine configuration out of
commits. Documentation-only changes need formatting and link checks.
