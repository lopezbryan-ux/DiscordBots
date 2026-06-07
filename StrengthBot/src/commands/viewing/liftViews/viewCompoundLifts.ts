import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { mongoClient } from '../../../index.js';
import { CompoundLifts, LiftingCategories } from '../../../utils/liftingUtils/liftChoices.js';
import {
  buildLiftField,
  DATABASE_NAME,
  getHeaviestByExercise,
  LiftLog,
  LIFTS_COLLECTION,
  liftSortChoices,
  MAX_EMBED_FIELDS,
  sortLiftLogs,
} from '../viewHelpers.js';

const EMBED_COLOR = 0x009688;

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
        .addChoices(...liftSortChoices),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const username = interaction.user.username;
    const exerciseFilter = interaction.options.getString('exercise');
    const sortOption = interaction.options.getString('sort') || 'amount-desc';
    const liftsCollection = mongoClient.db(DATABASE_NAME).collection<LiftLog>(LIFTS_COLLECTION);
    const userLogs = await liftsCollection.find({ username, liftCategory: LiftingCategories.Compound }).toArray();

    let displayLogs = getHeaviestByExercise(userLogs);
    if (exerciseFilter) {
      displayLogs = displayLogs.filter((entry) => entry.exercise === exerciseFilter);
    }
    displayLogs = sortLiftLogs(displayLogs, sortOption);

    if (displayLogs.length === 0) {
      const exerciseMsg = exerciseFilter ? ` for exercise **${exerciseFilter}**` : '';
      await interaction.reply(`No compound lifts logged yet${exerciseMsg}.`);
      return;
    }

    const shownLogs = displayLogs.slice(0, MAX_EMBED_FIELDS);
    const embed = new EmbedBuilder()
      .setTitle(`Your Heaviest Compound Lifts (${exerciseFilter || 'All Exercises'})`)
      .setColor(EMBED_COLOR)
      .setDescription(`Sorted by: ${sortOption} | User: ${username}`)
      .addFields(shownLogs.map(buildLiftField));

    if (displayLogs.length > MAX_EMBED_FIELDS) {
      embed.setFooter({ text: `Showing ${shownLogs.length} of ${displayLogs.length} entries` });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
