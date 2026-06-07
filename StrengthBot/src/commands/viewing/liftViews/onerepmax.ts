import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { oneRepMaxFormulas } from '../../../utils/liftingUtils/formulas.js';

const AVERAGE_FORMULA_KEY = 'average';
const AVERAGE_COLOR = 0x2196f3;
const FORMULA_COLOR = 0x4caf50;

const formulaChoices = [
  ...Object.entries(oneRepMaxFormulas).map(([key, formula]) => ({
    name: formula.name,
    value: key,
  })),
  { name: 'Average of All', value: AVERAGE_FORMULA_KEY },
];

export default {
  data: new SlashCommandBuilder()
    .setName('onerepmax')
    .setDescription('Calculate your estimated one-rep max (1RM) with various formulas')
    .addNumberOption((option) => option.setName('weight').setDescription('Weight lifted (lbs)').setMinValue(1).setRequired(true))
    .addIntegerOption((option) => option.setName('reps').setDescription('Number of reps performed').setMinValue(1).setRequired(true))
    .addStringOption((option) =>
      option
        .setName('formula')
        .setDescription('Formula to use')
        .setRequired(false)
        .addChoices(...formulaChoices),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const weight = interaction.options.getNumber('weight', true);
    const reps = interaction.options.getInteger('reps', true);
    const formulaKey = interaction.options.getString('formula') ?? AVERAGE_FORMULA_KEY;

    if (reps < 1 || weight <= 0) {
      await interaction.reply('Please enter a valid weight and at least 1 rep.');
      return;
    }

    if (formulaKey === AVERAGE_FORMULA_KEY) {
      const results = Object.entries(oneRepMaxFormulas).map(([, formula]) => ({
        name: formula.name,
        value: formula.calc(weight, reps),
      }));
      const average = results.reduce((sum, result) => sum + result.value, 0) / results.length;
      const description = [
        `**Weight:** ${weight} lbs`,
        `**Reps:** ${reps}`,
        '',
        ...results.map((result) => `**${result.name}:** ${result.value.toFixed(2)} lbs`),
        '',
        `**Average 1RM:** ${average.toFixed(2)} lbs`,
      ].join('\n');

      const embed = new EmbedBuilder().setTitle('One-Rep Max Calculator (Average of All)').setColor(AVERAGE_COLOR).setDescription(description);

      await interaction.reply({ embeds: [embed] });
      return;
    }

    const formula = oneRepMaxFormulas[formulaKey as keyof typeof oneRepMaxFormulas];
    if (!formula) {
      await interaction.reply('Invalid formula selected.');
      return;
    }

    const oneRepMax = formula.calc(weight, reps);
    const embed = new EmbedBuilder()
      .setTitle(`One-Rep Max Calculator (${formula.name})`)
      .setColor(FORMULA_COLOR)
      .setDescription(`**Weight:** ${weight} lbs\n**Reps:** ${reps}\n**Formula:** ${formula.desc}\n\n**Estimated 1RM:** ${oneRepMax.toFixed(2)} lbs`);

    await interaction.reply({ embeds: [embed] });
  },
};
