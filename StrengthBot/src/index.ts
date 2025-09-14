import { Client, GatewayIntentBits, Events, MessageFlags, Collection } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'url';
import { MongoClient } from 'mongodb';
// Create a new client instance
interface Command {
  data: { name: string };
  execute: (interaction: any) => Promise<void>;
}

interface ExtendedClient extends Client {
  commands: Collection<string, Command>;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// MongoDB client instance
const mongoClient = new MongoClient(process.env.MONGODB_URI!);
export { mongoClient };

const TOKEN = process.env.DISCORD_TOKEN;

const client = new Client({ intents: [GatewayIntentBits.Guilds] }) as ExtendedClient;

client.commands = new Collection();

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

(async () => {
  const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = getAllCommandFiles(commandsPath);

  for (const filePath of commandFiles) {
    const commandModule = await import(pathToFileURL(filePath).href);
    const command = Object.values(commandModule).find((cmd: any) => cmd && 'data' in cmd && 'execute' in cmd);
    if (command) {
      client.commands.set((command as Command).data.name, command as Command);
    } else {
      console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
  }

  // When the client is ready, run this code (only once).
  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
  });

  // Listen for interactions (slash commands)
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    console.log(interaction);
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: 'There was an error while executing this command!',
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.reply({
          content: 'There was an error while executing this command!',
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  });

  // Log in to Discord with your client's token
  client.login(TOKEN);
})();
