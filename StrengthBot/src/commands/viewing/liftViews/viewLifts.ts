import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder, SlashCommandSubcommandBuilder } from 'discord.js';
import { mongoClient } from '../../../index.js';
import { ArmWrestlingLifts, CompoundLifts, IsolationLifts, LiftingCategories } from '../../../utils/liftingUtils/liftChoices.js';
import {
  buildLiftField,
  DATABASE_NAME,
  getHeaviestByExercise,
  LiftLog,
  LIFTS_COLLECTION,
  liftSortChoices,
  MAX_EMBED_FIELDS,
  sortLiftLogs,
} from '../../../utils/viewingUtils/viewHelpers.js';

interface LiftViewConfig {
  choices: { name: string; value: string }[];
  color: number;
  defaultSort: string;
  emptyLabel: string;
  exerciseDescription: string;
  getDisplayLogs: (logs: LiftLog[]) => LiftLog[];
  liftCategory: string;
  titleLabel: string;
}

const LIFT_VIEW_CONFIGS: Record<string, LiftViewConfig> = {
  armwrestling: {
    choices: ArmWrestlingLifts,
    color: 0x00bfff,
    defaultSort: 'date-desc',
    emptyLabel: 'armwrestling lifts',
    exerciseDescription: 'Filter by armwrestling exercise (optional)',
    getDisplayLogs: (logs) => logs,
    liftCategory: LiftingCategories.ArmWrestling,
    titleLabel: 'Logged Armwrestling Lifts',
  },
  compound: {
    choices: CompoundLifts,
    color: 0x009688,
    defaultSort: 'amount-desc',
    emptyLabel: 'compound lifts',
    exerciseDescription: 'Filter by compound exercise (optional)',
    getDisplayLogs: getHeaviestByExercise,
    liftCategory: LiftingCategories.Compound,
    titleLabel: 'Heaviest Compound Lifts',
  },
  isolation: {
    choices: IsolationLifts,
    color: 0x8e44ad,
    defaultSort: 'date-desc',
    emptyLabel: 'isolation lifts',
    exerciseDescription: 'Filter by isolation exercise (optional)',
    getDisplayLogs: (logs) => logs,
    liftCategory: LiftingCategories.Isolation,
    titleLabel: 'Logged Isolation Lifts',
  },
};

function addViewOptions(subcommand: SlashCommandSubcommandBuilder, config: LiftViewConfig) {
  return subcommand
    .addStringOption((option) =>
      option
        .setName('exercise')
        .setDescription(config.exerciseDescription)
        .setRequired(false)
        .addChoices(...config.choices),
    )
    .addStringOption((option) =>
      option
        .setName('sort')
        .setDescription('Sort by (optional)')
        .setRequired(false)
        .addChoices(...liftSortChoices),
    );
}

export default {
  data: new SlashCommandBuilder()
    .setName('viewlifts')
    .setDescription('View your logged lifts')
    .addSubcommand((subcommand) =>
      addViewOptions(subcommand.setName('armwrestling').setDescription('View your logged armwrestling lifts'), LIFT_VIEW_CONFIGS.armwrestling),
    )
    .addSubcommand((subcommand) =>
      addViewOptions(subcommand.setName('compound').setDescription('View your logged compound lifts'), LIFT_VIEW_CONFIGS.compound),
    )
    .addSubcommand((subcommand) =>
      addViewOptions(subcommand.setName('isolation').setDescription('View your logged isolation lifts'), LIFT_VIEW_CONFIGS.isolation),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const username = interaction.user.username;
    const liftType = interaction.options.getSubcommand(true);
    const config = LIFT_VIEW_CONFIGS[liftType];

    if (!config) {
      await interaction.reply('Unknown lift type.');
      return;
    }

    const exerciseFilter = interaction.options.getString('exercise');
    const sortOption = interaction.options.getString('sort') || config.defaultSort;
    const liftsCollection = mongoClient.db(DATABASE_NAME).collection<LiftLog>(LIFTS_COLLECTION);
    const userLogs = await liftsCollection.find({ username, liftCategory: config.liftCategory }).toArray();

    let displayLogs = config.getDisplayLogs(userLogs);
    if (exerciseFilter) {
      displayLogs = displayLogs.filter((entry) => entry.exercise === exerciseFilter);
    }
    displayLogs = sortLiftLogs(displayLogs, sortOption);

    if (displayLogs.length === 0) {
      const exerciseMsg = exerciseFilter ? ` for exercise **${exerciseFilter}**` : '';
      await interaction.reply(`No ${config.emptyLabel} logged yet${exerciseMsg}.`);
      return;
    }

    const shownLogs = displayLogs.slice(0, MAX_EMBED_FIELDS);
    const embed = new EmbedBuilder()
      .setTitle(`Your ${config.titleLabel} (${exerciseFilter || 'All Exercises'})`)
      .setColor(config.color)
      .setDescription(`Sorted by: ${sortOption} | User: ${username}`)
      .addFields(shownLogs.map(buildLiftField));

    if (displayLogs.length > MAX_EMBED_FIELDS) {
      embed.setFooter({ text: `Showing ${shownLogs.length} of ${displayLogs.length} entries` });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
