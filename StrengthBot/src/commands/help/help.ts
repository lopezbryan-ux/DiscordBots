import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';

interface HelpCommand {
  name: string;
  desc: string;
}

interface HelpPage {
  category: string;
  description: string;
  commands: HelpCommand[];
}

const HELP_PAGES: HelpPage[] = [
  {
    category: 'General',
    description: 'Bot info and AI help.',
    commands: [
      { name: '/help', desc: 'Show categorized command help.' },
      { name: '/askstrengthbot', desc: 'Ask StrengthBot any fitness or strength question.' },
    ],
  },
  {
    category: 'Body Weight',
    description: 'Track body weight and calculate body composition stats.',
    commands: [
      { name: '/bmicalculator', desc: 'Calculate your BMI and see BMI ranges.' },
      { name: '/ffmi', desc: 'Calculate your Fat-Free Mass Index (FFMI).' },
      { name: '/logbodyweight', desc: 'Log your body weight.' },
      { name: '/viewbodyweight', desc: 'View your logged body weights.' },
      { name: '/weeklybodyweight', desc: 'View your weekly average body weight.' },
      { name: '/removebodyweightlog', desc: 'Remove a logged body weight entry by ID.' },
    ],
  },
  {
    category: 'Measurements',
    description: 'Log and review body measurements.',
    commands: [
      { name: '/logmeasurements', desc: 'Log measurements like bicep, forearm, wrist, chest, and quad.' },
      { name: '/viewmeasurements', desc: 'View logged body measurements for yourself or another user.' },
      { name: '/deletemeasurements', desc: 'Remove a logged measurement entry by ID.' },
    ],
  },
  {
    category: 'Lifting',
    description: 'Log, view, and remove lift entries.',
    commands: [
      { name: '/loglift', desc: 'Log a compound, isolation, or armwrestling lift.' },
      { name: '/viewlifts', desc: 'View compound, isolation, or armwrestling lifts.' },
      { name: '/removelift', desc: 'Remove a logged lift by ID.' },
    ],
  },
  {
    category: 'Progress',
    description: 'Compare, calculate, and visualize strength progress.',
    commands: [
      { name: '/leaderboard', desc: 'View lift leaderboards by most weight or best ratio.' },
      { name: '/onerepmax', desc: 'Calculate your estimated one-rep max with multiple formulas.' },
      { name: '/progresschart', desc: 'Show your progress chart for a specific exercise.' },
      { name: '/strengthstandards', desc: 'View strength standards for squat, bench, and deadlift.' },
    ],
  },
  {
    category: 'Cardio',
    description: 'Track and review cardio sessions.',
    commands: [
      { name: '/logcardio', desc: 'Log a cardio activity.' },
      { name: '/viewcardio', desc: 'View all your logged cardio activities.' },
      { name: '/removecardio', desc: 'Remove a logged cardio activity by ID.' },
    ],
  },
];

function createHelpEmbed(pageIndex: number): EmbedBuilder {
  const page = HELP_PAGES[pageIndex];

  return new EmbedBuilder()
    .setTitle(`StrengthBot Help: ${page.category}`)
    .setColor(0x3498db)
    .setDescription(page.description)
    .addFields(...page.commands.map((cmd) => ({ name: cmd.name, value: cmd.desc, inline: false })))
    .setFooter({ text: `Page ${pageIndex + 1} of ${HELP_PAGES.length}` });
}

function createHelpControls(pageIndex: number, disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('help_previous')
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || pageIndex === 0),
    new ButtonBuilder()
      .setCustomId('help_next')
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled || pageIndex === HELP_PAGES.length - 1),
  );
}

export default {
  data: new SlashCommandBuilder().setName('help').setDescription('Show categorized command help'),

  async execute(interaction: ChatInputCommandInteraction) {
    let pageIndex = 0;

    await interaction.reply({
      embeds: [createHelpEmbed(pageIndex)],
      components: [createHelpControls(pageIndex)],
    });

    const message = await interaction.fetchReply();
    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120000,
    });

    collector.on('collect', async (buttonInteraction) => {
      if (buttonInteraction.user.id !== interaction.user.id) {
        await buttonInteraction.reply({
          content: 'Run /help to open your own help menu.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      pageIndex += buttonInteraction.customId === 'help_next' ? 1 : -1;
      pageIndex = Math.max(0, Math.min(pageIndex, HELP_PAGES.length - 1));

      await buttonInteraction.update({
        embeds: [createHelpEmbed(pageIndex)],
        components: [createHelpControls(pageIndex)],
      });
    });

    collector.on('end', async () => {
      await interaction.editReply({
        components: [createHelpControls(pageIndex, true)],
      });
    });
  },
};
