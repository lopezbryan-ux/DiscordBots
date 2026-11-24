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

- **Host shutdown: 2:00 AM every day, America/Chicago (Central Time).** Restored at the user's request and verified in root's crontab on 2026-11-24: `0 2 * * * /sbin/shutdown -h now`. This shuts down the Raspberry Pi host and takes both bots offline. Keep this job at 2:00 AM; the smart plug's later power cutoff is a separate schedule.
- **Smart plug: turns off at 3:15 AM and on at 7:00 AM daily.** Both automations are enabled in the user's screenshot supplied on 2026-11-24. The screenshot does not display a timezone; the host uses America/Chicago. The plug schedule is separate from the host's shutdown job, and changing it does not change that job.
- **Daylight saving time:** America/Chicago follows CST in winter and CDT in summer, so the host job remains at 2:00 AM local Central time. Root's crontab has no timezone override. The installed `cron(8)` documentation says fixed-time jobs skipped by the spring-forward clock change run soon after the change; the missing 2:00 AM shutdown therefore runs shortly after 3:00 AM that night. No manual one-hour adjustment is needed.
- **Bot startup after power-on:** the enabled `pm2-lopezb123.service` runs `pm2 resurrect` at boot, restoring the saved processes. Book Bot becomes available after boot and its build, command registration, and Discord login complete.

The verified host shutdown takes Book Bot offline at 2:00 AM Central, before the plug's 3:15 AM cutoff. It becomes available after the plug's 7:00 AM power-on and startup complete. A PM2 restart cannot turn on a powered-off host. Do not infer a changed host shutdown time from an updated smart-plug schedule; verify the host job separately.

## First start only

When no `book-bot` PM2 process exists:

```bash
pm2 start ecosystem.config.js --only book-bot
```

Run this command from the DiscordBots root. After intentionally changing process
paths, run `pm2 save` so reboot restores the new configuration. For an explicitly
requested first start of StrengthBot, use `--only strengthbot` from the same root.

Creating or editing this skill does not request a live deployment. Run the workflow when the user asks to start, restart, or deploy the bot.
