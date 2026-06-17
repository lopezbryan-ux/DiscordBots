import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { mongoClient } from '../../../index.js';
import { ArmWrestlingLifts, CompoundLifts, IsolationLifts, LiftingCategories } from '../../../utils/liftingUtils/liftChoices.js';
import {
  buildLiftField,
  DATABASE_NAME,
  getHeaviestByExercise,
  LiftLog,
  LIFTS_COLLECTION,
  liftSortChoices,
  sortLiftLogs,
} from '../../../utils/viewingUtils/viewHelpers.js';

const PAGE_SIZE = 5;
const PAGINATION_TIMEOUT_MS = 120000;

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

function createLiftEmbed(
  config: LiftViewConfig,
  displayLogs: LiftLog[],
  pageIndex: number,
  exerciseFilter: string | null,
  sortOption: string,
  username: string,
): EmbedBuilder {
  const totalPages = Math.ceil(displayLogs.length / PAGE_SIZE);
  const startIndex = pageIndex * PAGE_SIZE;
  const shownLogs = displayLogs.slice(startIndex, startIndex + PAGE_SIZE);

  return new EmbedBuilder()
    .setTitle(`Your ${config.titleLabel} (${exerciseFilter || 'All Exercises'})`)
    .setColor(config.color)
    .setDescription(`Sorted by: ${sortOption} | User: ${username}`)
    .addFields(shownLogs.map(buildLiftField))
    .setFooter({
      text: `Page ${pageIndex + 1} of ${totalPages} | Showing ${startIndex + 1}-${startIndex + shownLogs.length} of ${displayLogs.length} entries`,
    });
}

function createPaginationControls(pageIndex: number, totalPages: number, disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('viewlifts_previous')
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || pageIndex === 0),
    new ButtonBuilder()
      .setCustomId('viewlifts_next')
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled || pageIndex === totalPages - 1),
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

    let displayLogs = exerciseFilter ? userLogs.filter((entry) => entry.exercise === exerciseFilter) : config.getDisplayLogs(userLogs);
    displayLogs = sortLiftLogs(displayLogs, sortOption);

    if (displayLogs.length === 0) {
      const exerciseMsg = exerciseFilter ? ` for exercise **${exerciseFilter}**` : '';
      await interaction.reply(`No ${config.emptyLabel} logged yet${exerciseMsg}.`);
      return;
    }

    let pageIndex = 0;
    const totalPages = Math.ceil(displayLogs.length / PAGE_SIZE);
    const hasMultiplePages = totalPages > 1;

    await interaction.reply({
      embeds: [createLiftEmbed(config, displayLogs, pageIndex, exerciseFilter, sortOption, username)],
      components: hasMultiplePages ? [createPaginationControls(pageIndex, totalPages)] : [],
    });

    if (!hasMultiplePages) {
      return;
    }

    const message = await interaction.fetchReply();
    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: PAGINATION_TIMEOUT_MS,
    });

    collector.on('collect', async (buttonInteraction) => {
      if (buttonInteraction.user.id !== interaction.user.id) {
        await buttonInteraction.reply({
          content: 'Run /viewlifts to open your own lift view.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      pageIndex += buttonInteraction.customId === 'viewlifts_next' ? 1 : -1;
      pageIndex = Math.max(0, Math.min(pageIndex, totalPages - 1));

      await buttonInteraction.update({
        embeds: [createLiftEmbed(config, displayLogs, pageIndex, exerciseFilter, sortOption, username)],
        components: [createPaginationControls(pageIndex, totalPages)],
      });
    });

    collector.on('end', async () => {
      await interaction.editReply({
        components: [createPaginationControls(pageIndex, totalPages, true)],
      });
    });
  },
};
