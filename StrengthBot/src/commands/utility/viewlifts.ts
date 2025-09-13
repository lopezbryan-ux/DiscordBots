import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(__filename, '../../../../');
const LOG_FILE = path.join(projectRoot, 'lift_logs.json');

export default {
  data: new SlashCommandBuilder()
    .setName('viewlifts')
    .setDescription('View your logged lifts')
    .addStringOption((option) =>
      option
        .setName('exercise')
        .setDescription('Filter by exercise (optional)')
        .setRequired(false)
        .addChoices(
          { name: 'Barbell Squat', value: 'Barbell Squat' },
          { name: 'Barbell Bench', value: 'Barbell Bench' },
          { name: 'Barbell Deadlift', value: 'Barbell Deadlift' },
          { name: 'Side Pressure (Wrist wrench)', value: 'Side Pressure (Wrist wrench)' },
          { name: 'Static Pronation (Standing)', value: 'Static Pronation (Standing)' },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('sort')
        .setDescription('Sort by (optional)')
        .setRequired(false)
        .addChoices(
          { name: 'Amount (Descending)', value: 'amount-desc' },
          { name: 'Amount (Ascending)', value: 'amount-asc' },
          { name: 'Bodyweight (Descending)', value: 'bodyweight-desc' },
          { name: 'Bodyweight (Ascending)', value: 'bodyweight-asc' },
          { name: 'Date Added (Newest First)', value: 'date-desc' },
          { name: 'Date Added (Oldest First)', value: 'date-asc' },
        ),
    ),
  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const username = chatInteraction.user.username;
    interface LiftLogEntry {
      username: string;
      date: string;
      exercise: string;
      amount: number;
      bodyweight: number;
      additionaldetails: string;
    }
    let logs: LiftLogEntry[] = [];
    if (fs.existsSync(LOG_FILE)) {
      logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')) as LiftLogEntry[];
    }
    let userLogs = logs.filter((entry: LiftLogEntry) => entry.username === username);
    const exerciseFilter = chatInteraction.options.getString('exercise');
    const sortOption = chatInteraction.options.getString('sort');
    if (exerciseFilter) {
      userLogs = userLogs.filter((entry: LiftLogEntry) => entry.exercise === exerciseFilter);
    }
    if (sortOption) {
      if (sortOption === 'amount-desc') {
        userLogs = userLogs.sort((a, b) => b.amount - a.amount);
      } else if (sortOption === 'amount-asc') {
        userLogs = userLogs.sort((a, b) => a.amount - b.amount);
      } else if (sortOption === 'bodyweight-desc') {
        userLogs = userLogs.sort((a, b) => b.bodyweight - a.bodyweight);
      } else if (sortOption === 'bodyweight-asc') {
        userLogs = userLogs.sort((a, b) => a.bodyweight - b.bodyweight);
      } else if (sortOption === 'date-desc') {
        userLogs = userLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      } else if (sortOption === 'date-asc') {
        userLogs = userLogs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      }
    }
    if (userLogs.length === 0) {
      await interaction.reply('No lifts logged yet.');
      return;
    }
    // Format the logs for display using an embed
    const embed = new EmbedBuilder()
      .setTitle(`Your Logged Lifts (${exerciseFilter || 'All Exercises'})`)
      .setColor(0x00bfff)
      .setDescription(`Sorted by: ${sortOption || 'None'} | User: ${username}`);

    userLogs.forEach((entry) => {
      const dateOnly = entry.date.split('T')[0];
      const globalIndex = logs.findIndex(
        (e) =>
          e.username === entry.username &&
          e.date === entry.date &&
          e.exercise === entry.exercise &&
          e.amount === entry.amount &&
          e.bodyweight === entry.bodyweight &&
          e.additionaldetails === entry.additionaldetails,
      );
      // Alternate emoji for visual separation
      const emoji = globalIndex % 2 === 0 ? '🏋️' : '🔹';
      let name = `─────────────\n${emoji} **${entry.exercise.toUpperCase()}** (ID: ${globalIndex})`;
      let value = `**Amount:** ${entry.amount} lbs\n` + `**Bodyweight:** ${entry.bodyweight} lbs\n` + `**Date:** ${dateOnly}`;
      if (entry.additionaldetails) {
        value += `\n**Details:** ${entry.additionaldetails}`;
      }
      embed.addFields({
        name,
        value,
        inline: false,
      });
    });
    await interaction.reply({ embeds: [embed] });
  },
};
