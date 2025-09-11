import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(__filename, '../../../../');
const LOG_FILE = path.join(projectRoot, 'lift_logs.json');

export default {
  data: new SlashCommandBuilder().setName('viewlifts').setDescription('View your logged lifts'),
  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const username = chatInteraction.user.username;
    interface LiftLogEntry {
      username: string;
      date: string;
      exercise: string;
      amount: number;
      bodyweight: number;
      datename: string;
    }
    let logs: LiftLogEntry[] = [];
    if (fs.existsSync(LOG_FILE)) {
      logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')) as LiftLogEntry[];
    }
    const userLogs = logs.filter((entry: LiftLogEntry) => entry.username === username);
    if (userLogs.length === 0) {
      await interaction.reply('No lifts logged yet.');
      return;
    }
    // Format the logs for display
    const formatted = userLogs
      .map((entry, idx) => {
        const dateOnly = entry.date.split('T')[0];
        return `${entry.exercise}: ${entry.amount}lbs @ ${entry.bodyweight}lbs on ${dateOnly} ${entry.datename ? `(${entry.datename})` : ''}`;
      })
      .join('\n');
    await interaction.reply(`Your logged lifts:\n${formatted}`);
  },
};
