import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(__filename, '../../../../');
const LOG_FILE = path.join(projectRoot, 'lift_logs.json');

export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View lift leaderboards')
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('Leaderboard type')
        .setRequired(true)
        .addChoices({ name: 'Most Weight Lifted', value: 'weight' }, { name: 'Best Bodyweight Ratio', value: 'ratio' }),
    )
    .addStringOption((option) =>
      option
        .setName('exercise')
        .setDescription('Exercise category (for weight leaderboard)')
        .setRequired(true)
        .addChoices(
          { name: 'Barbell Squat', value: 'Barbell Squat' },
          { name: 'Barbell Bench', value: 'Barbell Bench' },
          { name: 'Barbell Deadlift', value: 'Barbell Deadlift' },
        ),
    ),
  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const type = chatInteraction.options.getString('type', true);
    const exercise = chatInteraction.options.getString('exercise');
    interface LiftLogEntry {
      username: string;
      date: string;
      exercise: string;
      amount: number;
      bodyweight: number;
      dateName: string;
    }
    let logs: LiftLogEntry[] = [];
    if (fs.existsSync(LOG_FILE)) {
      logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')) as LiftLogEntry[];
    }
    let leaderboard: string = '';
    if (type === 'weight') {
      if (!exercise) {
        await interaction.reply('Please select an exercise for the weight leaderboard.');
        return;
      }
      const filtered = logs.filter((l) => l.exercise === exercise);
      const sorted = filtered.sort((a, b) => b.amount - a.amount);
      leaderboard = sorted
        .slice(0, 10)
        .map((entry, idx) => `${idx + 1}. ${entry.username}: ${entry.amount}lbs on ${entry.dateName || entry.date}`)
        .join('\n');
      await interaction.reply(`🏆 Most Weight Lifted (${exercise}):\n${leaderboard || 'No entries yet.'}`);
    } else if (type === 'ratio') {
      const filteredExercises = logs.filter((l) => l.exercise === exercise);
      const withRatio = filteredExercises.map((l) => ({ ...l, ratio: l.amount / l.bodyweight }));
      const sorted = withRatio.sort((a, b) => b.ratio - a.ratio);
      leaderboard = sorted
        .slice(0, 10)
        .map((entry, idx) => `${idx + 1}. ${entry.username}: ${entry.ratio.toFixed(2)} ratio (${entry.amount}lbs @ ${entry.bodyweight}lbs)`)
        .join('\n');
      await interaction.reply(`🏆 Best Bodyweight-to-Weight Ratio:\n${leaderboard || 'No entries yet.'}`);
    } else {
      await interaction.reply('Invalid leaderboard type.');
    }
  },
};
