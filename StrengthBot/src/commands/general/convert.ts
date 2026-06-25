import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';

const KILOGRAMS_TO_POUNDS = 2.2046226218;
const POUNDS_TO_KILOGRAMS = 0.45359237;
const EMBED_COLOR = 0xf1c40f;

const conversionChoices = [
  { name: 'Kilograms to pounds', value: 'kg_to_lbs' },
  { name: 'Pounds to kilograms', value: 'lbs_to_kg' },
];

function formatNumber(value: number): string {
  return value.toLocaleString('en-US', {
    maximumFractionDigits: 3,
    minimumFractionDigits: 3,
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName('convert')
    .setDescription('Convert weight between kilograms and pounds')
    .addNumberOption((option) => option.setName('amount').setDescription('Weight amount to convert').setMinValue(0.01).setRequired(true))
    .addStringOption((option) =>
      option
        .setName('direction')
        .setDescription('Conversion direction')
        .setRequired(true)
        .addChoices(...conversionChoices),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const amount = interaction.options.getNumber('amount', true);
    const direction = interaction.options.getString('direction', true);

    if (amount <= 0) {
      await interaction.reply('Please enter an amount greater than 0.');
      return;
    }

    const isKilogramsToPounds = direction === 'kg_to_lbs';
    const convertedAmount = isKilogramsToPounds ? amount * KILOGRAMS_TO_POUNDS : amount * POUNDS_TO_KILOGRAMS;
    const inputUnit = isKilogramsToPounds ? 'kg' : 'lbs';
    const outputUnit = isKilogramsToPounds ? 'lbs' : 'kg';

    const embed = new EmbedBuilder()
      .setTitle('Weight Conversion')
      .setColor(EMBED_COLOR)
      .addFields(
        { name: 'Input', value: `${formatNumber(amount)} ${inputUnit}`, inline: true },
        { name: 'Result', value: `${formatNumber(convertedAmount)} ${outputUnit}`, inline: true },
      );

    await interaction.reply({ embeds: [embed] });
  },
};
