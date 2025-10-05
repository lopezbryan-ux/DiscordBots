import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { CompoundLifts, LiftingCategories } from '../../../utils/liftingUtils/liftChoices.js';
import { mongoClient } from '../../../index.js';

export default {
  data: new SlashCommandBuilder()
    .setName('viewcompoundlifts')
    .setDescription('View your logged compound lifts')
    .addStringOption((option) =>
      option
        .setName('exercise')
        .setDescription('Filter by exercise (optional)')
        .setRequired(false)
        .addChoices(...CompoundLifts),
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
    const db = mongoClient.db('StrengthBotDb');
    const liftsCollection = db.collection('StrengthBotCollection');
    const userLogs = await liftsCollection
      .find({
        username,
        liftCategory: LiftingCategories.Compound, // Only Compound lifts
      })
      .toArray();

    const exerciseFilter = chatInteraction.options.getString('exercise');
    // Only show the heaviest achieved lift for each exercise
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const heaviestByExercise: Record<string, any> = {};
    userLogs.forEach((entry) => {
      if (!heaviestByExercise[entry.exercise] || entry.amount > heaviestByExercise[entry.exercise].amount) {
        heaviestByExercise[entry.exercise] = entry;
      }
    });
    let displayLogs = Object.values(heaviestByExercise);
    if (exerciseFilter) {
      displayLogs = displayLogs.filter((entry) => entry.exercise === exerciseFilter);
    }
    if (displayLogs.length === 0) {
      const exerciseMsg = exerciseFilter ? ` for exercise **${exerciseFilter}**` : '';
      await interaction.reply(`No compound lifts logged yet${exerciseMsg}.`);
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle(`Your Heaviest Compound Lifts (${exerciseFilter || 'All Exercises'})`)
      .setColor(0x009688)
      .setDescription(`User: ${username}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    displayLogs.forEach((entry: any) => {
      const dateOnly = entry.date.split('T')[0] || entry.date;
      const name = `─────────────\n🏋️ **${entry.exercise.toUpperCase()}** (ID: ${entry._id})`;
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
