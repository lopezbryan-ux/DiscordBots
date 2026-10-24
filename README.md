# DiscordBots

Independent Discord bots and tools maintained in one Git repository and hosted
on a Raspberry Pi.

| Package                              | Purpose                                           | Runtime                   |
| ------------------------------------ | ------------------------------------------------- | ------------------------- |
| [StrengthBot](StrengthBot/README.md) | Workout logging, progress, and fitness commands   | PM2 `strengthbot`         |
| [BookBot](BookBot/README.md)         | Book libraries, reviews, rankings, and club polls | PM2 `book-bot`            |
| [DiscordMCP](DiscordMCP/README.md)   | Read-only inspection of Discord permissions       | Started by the MCP client |

Each package has its own `package.json`, lockfile, `node_modules`, `.env`, and
`dist` directory. Dependency versions and deployments remain independent.
The root package provides commands without enabling npm workspaces or hoisting.

## Setup

Clone this repository once. Install Node.js and npm versions compatible with all
packages, then install each package's locked dependencies:

```bash
npm run install:all
```

Follow each package's README to configure its ignored `.env`. BookBot and
DiscordMCP provide `.env.example` templates with fictional IDs. Give environment
files mode `600` on the Pi. Configuration is local to each package; keep bot
tokens, database credentials, local reports, and PM2 dumps out of Git.

Build everything or just one package:

```bash
npm run build
npm run build:bookbot
npm run build:strengthbot
npm run build:mcp
```

Run the root deployment tests and both package test suites:

```bash
npm test
```

StrengthBot currently has no automated test suite; its TypeScript build is part
of `npm run build`. Individual package commands also work, for example
`npm --prefix BookBot test`.

## Deployment on the Pi

The root `ecosystem.config.js` declares separate `strengthbot` and `book-bot`
processes with paths relative to this checkout. Follow the package deployment
instructions: [StrengthBot](StrengthBot/SKILL.md) or [BookBot](BookBot/SKILL.md).

For the first start of a process that does not already exist:

```bash
pm2 start ecosystem.config.js --only book-bot
```

For routine deployment of an existing bot:

```bash
pm2 restart book-bot
pm2 status book-bot
pm2 logs book-bot --lines 50 --nostream
```

Use `strengthbot` for StrengthBot. Each bot's `cleanrun` invokes
`scripts/run-bot.sh`, which takes a shared `flock` lock, pulls with `--ff-only`,
cleans and builds that package, registers its commands, then releases the lock
before launching it. This keeps simultaneous boot preparation from colliding in
the shared Git checkout. The deploy script requires Bash, `flock`, Git, npm, and
Node.js on the Pi. A failed pull, build, or registration stops that launch.

Commit and push changes before deploying them from another checkout. A pull
updates the whole repository; restarting one bot builds and runs that package.
Save the PM2 process list with `pm2 save` after verifying a first start or an
intentional process-path change. An enabled PM2 system service restores the
saved processes at boot.

When deliberately moving an existing bot to another checkout, verify the new
package's build and local configuration first and back up the saved PM2 list
under an ignored local directory. On this host, an ecosystem-file restart
retained the old working directory. Remove only the affected process entry and
start it from the root configuration to apply the new path:

```bash
pm2 delete book-bot
pm2 start ecosystem.config.js --only book-bot
```

Confirm the process uses the new working directory and reaches Discord's ready
event before running `pm2 save`. Routine updates at the same path continue to
use `pm2 restart book-bot`.

DiscordMCP stays registered with its MCP client using its compiled entry point.
It is launched by the client when connecting. When reusing BookBot credentials,
its ignored configuration should point to this checkout's `BookBot/.env`.

## BookBot import

BookBot's 55-commit development history was imported into this repository. Real
Discord IDs in historical examples and tests were replaced with fictional IDs;
the import preserves commit authors, dates, and messages, with affected commit
hashes changing. New BookBot work belongs in `BookBot/` here. The original
standalone checkout can be retained locally for rollback. Local environment
files, dependency installations, builds, and database snapshots are not part of
the imported history. Moving the code does not require moving the database.
