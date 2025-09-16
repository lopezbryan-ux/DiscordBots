import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { IsolationLifts, LiftingCategories } from '../../utils/liftChoices.js';
import { mongoClient } from '../../index.js';

export default {
  data: new SlashCommandBuilder()
    .setName('viewisolationlifts')
    .setDescription('View your logged isolation lifts')
    .addStringOption((option) =>
      option
        .setName('exercise')
        .setDescription('Filter by exercise (optional)')
        .setRequired(false)
        .addChoices(...IsolationLifts),
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
    let userLogs = await liftsCollection
      .find({
        username,
        liftCategory: LiftingCategories.Isolation, // Only Isolation lifts
      })
      .toArray();

    const exerciseFilter = chatInteraction.options.getString('exercise');
    const sortOption = chatInteraction.options.getString('sort');
    if (exerciseFilter) {
      userLogs = userLogs.filter((entry) => entry.exercise === exerciseFilter);
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
      const exerciseMsg = exerciseFilter ? ` for exercise **${exerciseFilter}**` : '';
      await interaction.reply(`No isolation lifts logged yet${exerciseMsg}.`);
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle(`Your Logged Isolation Lifts (${exerciseFilter || 'All Exercises'})`)
      .setColor(0x8e44ad)
      .setDescription(`Sorted by: ${sortOption || 'None'} | User: ${username}`);

    userLogs.forEach((entry: any) => {
      const dateOnly = entry.date.split('T')[0] || entry.date;
      let name = `─────────────\n💪 **${entry.exercise.toUpperCase()}** (ID: ${entry._id})`;
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
