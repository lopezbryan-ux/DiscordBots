import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { REST, Routes } from 'discord.js';
import fs from 'node:fs';
import dotenv from 'dotenv';

dotenv.config();

interface DeployableCommand {
  data: {
    toJSON: () => unknown;
  };
}

const commands: unknown[] = [];

function getAllCommandFiles(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllCommandFiles(filePath));
    } else if (file.endsWith('.js')) {
      results.push(filePath);
    }
  }
  return results;
}

function isDeployableCommand(value: unknown): value is DeployableCommand {
  if (typeof value !== 'object' || value === null || !('data' in value)) return false;

  const data = (value as { data?: { toJSON?: unknown } }).data;
  return typeof data?.toJSON === 'function';
}

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = getAllCommandFiles(commandsPath);

async function loadCommands() {
  for (const filePath of commandFiles) {
    const commandModule = await import(pathToFileURL(filePath).href);
    const command = [commandModule.default, ...Object.values(commandModule)].find(isDeployableCommand);
    if (command) {
      commands.push(command.data.toJSON());
    }
  }
}

(async () => {
  try {
    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.CLIENT_ID;
    // GUILD_IDS accepts a comma-separated list; GUILD_ID remains supported for existing setups.
    const guildIds = [
      ...new Set(
        (process.env.GUILD_IDS ?? process.env.GUILD_ID ?? '')
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ];

    if (!token || !clientId || guildIds.length === 0) {
      throw new Error('Set DISCORD_TOKEN, CLIENT_ID, and GUILD_IDS (or GUILD_ID) before deploying commands.');
    }
    if (guildIds.some((id) => !/^\d{17,20}$/.test(id))) {
      throw new Error('GUILD_IDS must contain comma-separated Discord server IDs.');
    }

    const rest = new REST().setToken(token);
    await loadCommands();
    console.log('Started refreshing application (/) commands.');

    for (const guildId of guildIds) {
      try {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
        console.log(`Successfully reloaded ${commands.length} application (/) commands for guild ${guildId}.`);
      } catch (error) {
        console.error(`Failed to reload commands for guild ${guildId}:`, error instanceof Error ? error.message : 'Unknown error');
        process.exitCode = 1;
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Failed to deploy application commands.');
    process.exitCode = 1;
  }
})();
