import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { mongoClient } from '../../../index.js';
import { ArmWrestlingLifts, CompoundLifts } from '../../../utils/liftingUtils/liftChoices.js';

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
        .addChoices(...ArmWrestlingLifts, ...CompoundLifts),
    ),
  async execute(interaction: CommandInteraction<CacheType>) {
    await interaction.deferReply();
    try {
      const chatInteraction = interaction as ChatInputCommandInteraction;
      const type = chatInteraction.options.getString('type', true);
      const exercise = chatInteraction.options.getString('exercise');
      interface LiftLogEntry {
        id: number;
        username: string;
        date: string;
        exercise: string;
        amount: number;
        bodyweight: number;
        additionaldetails: string;
      }
      // Use shared MongoDB client
      const db = mongoClient.db('StrengthBotDb');
      const liftsCollection = db.collection('StrengthBotCollection');
      const rawLogs = await liftsCollection.find({}).toArray();
      let logs: LiftLogEntry[] = rawLogs.map((doc: any) => ({
        id: doc.id,
        username: doc.username,
        date: doc.date,
        exercise: doc.exercise,
        amount: doc.amount,
        bodyweight: doc.bodyweight,
        additionaldetails: doc.additionaldetails,
      }));
      let leaderboard: string = '';
      // Helper to get top N unique users from a sorted array
      function getTopNUnique(sortedArr: any[], n: number) {
        const seen = new Set();
        const result = [];
        for (const entry of sortedArr) {
          if (!seen.has(entry.username)) {
            seen.add(entry.username);
            result.push(entry);
          }
          if (result.length === n) break;
        }
        return result;
      }

      if (type === 'weight') {
        if (!exercise) {
          await interaction.editReply('Please select an exercise for the weight leaderboard.');
          return;
        }
        const filtered = logs.filter((l) => l.exercise === exercise);
        const sorted = filtered.sort((a, b) => b.amount - a.amount);
        const topUnique = getTopNUnique(sorted, 3);
        const embed = new EmbedBuilder()
          .setTitle(`🏆 Most Weight Lifted (${exercise})`)
          .setColor(0xffd700)
          .setDescription('Top 3 unique lifters by weight lifted');
        if (topUnique.length === 0) {
          embed.setDescription('No entries yet.');
        } else {
          topUnique.forEach((entry, idx) => {
            let value = `**Amount:** ${entry.amount} lbs\n**Bodyweight:** ${entry.bodyweight} lbs\n**Date:** ${entry.date}`;
            if (entry.additionaldetails) {
              value += `\n**Details:** ${entry.additionaldetails}`;
            }
            embed.addFields({
              name: `#${idx + 1} 🏋️ ${entry.username}`,
              value,
              inline: false,
            });
          });
        }
        await interaction.editReply({ embeds: [embed] });
      } else if (type === 'ratio') {
        const filteredExercises = logs.filter((l) => l.exercise === exercise);
        const withRatio = filteredExercises.map((l) => ({ ...l, ratio: l.amount / l.bodyweight }));
        const sorted = withRatio.sort((a, b) => b.ratio - a.ratio);
        const topUnique = getTopNUnique(sorted, 3);
        const embed = new EmbedBuilder()
          .setTitle(`🏆 Best Bodyweight-to-Weight Ratio (${exercise})`)
          .setColor(0x00bfff)
          .setDescription('Top 3 unique lifters by ratio');
        if (topUnique.length === 0) {
          embed.setDescription('No entries yet.');
        } else {
          topUnique.forEach((entry, idx) => {
            let value = `**Ratio:** ${entry.ratio.toFixed(2)}\n**Amount:** ${entry.amount} lbs\n**Bodyweight:** ${entry.bodyweight} lbs`;
            if (entry.additionaldetails) {
              value += `\n**Details:** ${entry.additionaldetails}`;
            }
            embed.addFields({
              name: `#${idx + 1} 💪 ${entry.username}`,
              value,
              inline: false,
            });
          });
        }
        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.editReply('Invalid leaderboard type.');
      }
    } catch (err) {
      console.error('Error in leaderboard command:', err);
      await interaction.editReply(`There was an error while executing this command!\nError: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
