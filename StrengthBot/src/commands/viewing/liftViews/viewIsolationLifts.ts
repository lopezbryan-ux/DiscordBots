import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { mongoClient } from '../../../index.js';
import { IsolationLifts, LiftingCategories } from '../../../utils/liftingUtils/liftChoices.js';
import { buildLiftField, DATABASE_NAME, LiftLog, LIFTS_COLLECTION, liftSortChoices, MAX_EMBED_FIELDS, sortLiftLogs } from '../viewHelpers.js';

const EMBED_COLOR = 0x8e44ad;

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
        .addChoices(...liftSortChoices),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const username = interaction.user.username;
    const exerciseFilter = interaction.options.getString('exercise');
    const sortOption = interaction.options.getString('sort') || 'date-desc';
    const liftsCollection = mongoClient.db(DATABASE_NAME).collection<LiftLog>(LIFTS_COLLECTION);
    let userLogs = await liftsCollection.find({ username, liftCategory: LiftingCategories.Isolation }).toArray();

    if (exerciseFilter) {
      userLogs = userLogs.filter((entry) => entry.exercise === exerciseFilter);
    }
    userLogs = sortLiftLogs(userLogs, sortOption);

    if (userLogs.length === 0) {
      const exerciseMsg = exerciseFilter ? ` for exercise **${exerciseFilter}**` : '';
      await interaction.reply(`No isolation lifts logged yet${exerciseMsg}.`);
      return;
    }

    const shownLogs = userLogs.slice(0, MAX_EMBED_FIELDS);
    const embed = new EmbedBuilder()
      .setTitle(`Your Logged Isolation Lifts (${exerciseFilter || 'All Exercises'})`)
      .setColor(EMBED_COLOR)
      .setDescription(`Sorted by: ${sortOption} | User: ${username}`)
      .addFields(shownLogs.map(buildLiftField));

    if (userLogs.length > MAX_EMBED_FIELDS) {
      embed.setFooter({ text: `Showing ${shownLogs.length} of ${userLogs.length} entries` });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
