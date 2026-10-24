---
name: book-bot-pm2
description: Deploy, start, or restart Book-Bot through PM2 when the user asks to deploy changes or restart the bot.
---

# Deploy Book-Bot

Run package commands from `DiscordBots/BookBot`. This is the canonical BookBot
package inside the DiscordBots monorepo. Run commands involving
`ecosystem.config.js` from the DiscordBots root.

## Deploy changes to the existing bot

When the user says **"deploy them," "deploy the changes," or "restart the bot,"** and the `book-bot` PM2 process is already known to exist, the next deployment action is:

```bash
pm2 restart book-bot
```

Use process information already established in the conversation. Extra PM2 metadata inspection (`pm2 jlist`, environment dumps, or process descriptions) is unnecessary for this routine restart. Inspect further only if the restart fails or the deployment setup has changed.

If process existence is unknown, check once:

```bash
pm2 status book-bot
```

Restart the existing process. Use the first-start command below only when `book-bot` does not exist.

## What the restart deploys

The existing process runs `npm run cleanrun`, which calls the shared
`scripts/run-bot.sh BookBot`. It takes a repository-wide deployment lock so both
bots can start safely together at boot. Restarting performs these steps:

1. `git pull --ff-only` fetches the shared repository's configured upstream.
2. `rm -rf dist` removes the previous compiled output.
3. `npm run build` compiles TypeScript.
4. `npm run deploy-commands` registers Discord commands.
5. The shared lock is released and `node dist/index.js` runs the updated bot.

Local source edits in this checkout are included in the rebuild if the pull succeeds; committing and pushing those edits is not a prerequisite for local deployment. Changes made in another checkout must be committed and pushed to the branch this bot pulls. Use the known working-tree state, or check `git status --short` if it is unknown.

The restart handles building and Discord command registration. Separate build or registration commands are needed only when troubleshooting. Inspect `package.json` if the scripts have changed.

## Verify deployment after restarting

```bash
pm2 status book-bot
pm2 logs book-bot --lines 50 --nostream
```

Confirm the latest startup completed the build, printed `Successfully reloaded application (/) commands.`, and reached `Ready! Logged in as ...`. PM2 reporting `online` alone does not confirm startup finished. Distinguish older log errors from errors produced by this restart. If startup fails, inspect the failing step before restarting again.

## Daily availability

- **Shutdown: 2:00 AM every day, America/Chicago (Central Time).** Verified in root's crontab: `0 2 * * * /sbin/shutdown -h now`. This shuts down the Raspberry Pi host and takes Book Bot offline.
- **Morning power-on: 7:00 AM every day, America/Chicago (Central Time).** The smart plug turns on at this time, as confirmed by the user. The host's cron jobs do not control morning power-on.
- **Bot startup after power-on:** the enabled `pm2-lopezb123.service` runs `pm2 resurrect` at boot, restoring the saved processes. Book Bot becomes available after boot and its build, command registration, and Discord login complete.

Expect Book Bot to be offline from 2:00 AM Central until startup completes after the plug turns on at 7:00 AM Central. A PM2 restart cannot turn on a powered-off host.

## First start only

When no `book-bot` PM2 process exists:

```bash
pm2 start ecosystem.config.js --only book-bot
```

Run this command from the DiscordBots root. After intentionally changing process
paths, run `pm2 save` so reboot restores the new configuration. For an explicitly
requested first start of StrengthBot, use `--only strengthbot` from the same root.

Creating or editing this skill does not request a live deployment. Run the workflow when the user asks to start, restart, or deploy the bot.
