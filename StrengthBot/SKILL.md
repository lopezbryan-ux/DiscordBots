---
name: strengthbot-pm2
description: Start or restart StrengthBot with PM2 so Discord runs the updated code and commands.
---

# StrengthBot PM2 workflow

Run package commands from `DiscordBots/StrengthBot`. Run commands involving
`ecosystem.config.js` from the DiscordBots root.

## Start the bot

For the initial PM2 start, use:

```bash
pm2 start ecosystem.config.js --only strengthbot
```

The equivalent command for the sibling BookBot package is:

```bash
pm2 start ecosystem.config.js --only book-bot
```

The ecosystem file supplies each process name, package directory, and
`npm run cleanrun` command. Save intentional process-path changes with `pm2 save`.

## Apply changes to the running bot

Check whether StrengthBot already has a PM2 process:

```bash
pm2 list
```

If it already exists, restart that process instead of creating another:

```bash
pm2 restart strengthbot
```

The process reruns `cleanrun` on restart. That script calls the shared
`scripts/run-bot.sh StrengthBot`, which takes a repository-wide deployment lock
before preparing the package. It executes these steps in order:

1. `git pull --ff-only` fetches the shared repository's configured upstream.
2. `rm -rf dist` removes the previous compiled output.
3. `npm run build` compiles TypeScript.
4. `npm run deploy-commands` registers Discord commands.
5. The shared lock is released and `node dist/index.js` runs the updated bot.

Each step must succeed before the next runs. Changes made elsewhere must be committed and pushed to the branch used by the bot's checkout before restarting to retrieve them. Local source changes are included in the rebuild if the pull succeeds; check for uncommitted changes before pulling.

After starting or restarting, confirm the process status and inspect startup output:

```bash
pm2 status strengthbot
pm2 logs strengthbot --lines 50 --nostream
```

Inspect `package.json` if the scripts change. Creating or editing this skill does not itself request a live bot restart; run the workflow when the user requests starting, restarting, or deploying the bot.
