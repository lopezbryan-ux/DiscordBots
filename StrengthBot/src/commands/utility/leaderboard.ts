import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { MongoClient } from 'mongodb';
import { ArmWrestlingLifts, CompoundLifts } from '../../utils/liftChoices.js';

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
    const uri =
      'mongodb+srv://***REMOVED***'; // Replace with your actual connection string
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('StrengthBotDb');
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
    await client.close();
    let leaderboard: string = '';
    if (type === 'weight') {
      if (!exercise) {
        await interaction.reply('Please select an exercise for the weight leaderboard.');
        return;
      }
      const filtered = logs.filter((l) => l.exercise === exercise);
      const sorted = filtered.sort((a, b) => b.amount - a.amount);
      const embed = new EmbedBuilder()
        .setTitle(`🏆 Most Weight Lifted (${exercise})`)
        .setColor(0xffd700)
        .setDescription('Top 5 lifters by weight lifted');
      if (sorted.length === 0) {
        embed.setDescription('No entries yet.');
      } else {
        sorted.slice(0, 5).forEach((entry, idx) => {
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
      await interaction.reply({ embeds: [embed] });
    } else if (type === 'ratio') {
      const filteredExercises = logs.filter((l) => l.exercise === exercise);
      const withRatio = filteredExercises.map((l) => ({ ...l, ratio: l.amount / l.bodyweight }));
      const sorted = withRatio.sort((a, b) => b.ratio - a.ratio);
      const embed = new EmbedBuilder()
        .setTitle(`🏆 Best Bodyweight-to-Weight Ratio (${exercise})`)
        .setColor(0x00bfff)
        .setDescription('Top 5 lifters by ratio');
      if (sorted.length === 0) {
        embed.setDescription('No entries yet.');
      } else {
        sorted.slice(0, 5).forEach((entry, idx) => {
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
      await interaction.reply({ embeds: [embed] });
    } else {
      await interaction.reply('Invalid leaderboard type.');
    }
  },
};
