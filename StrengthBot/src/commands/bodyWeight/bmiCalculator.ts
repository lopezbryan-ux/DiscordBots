import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';

const INCHES_PER_FOOT = 12;
const BMI_IMPERIAL_FACTOR = 703;
const EMBED_COLOR = 0x8e44ad;

const BMI_RANGES = [
  { range: '< 18.5', label: 'Underweight' },
  { range: '18.5 - 24.9', label: 'Normal weight' },
  { range: '25 - 29.9', label: 'Overweight' },
  { range: '30+', label: 'Obese' },
];

function getBmiCategory(bmi: number): string {
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Normal weight';
  if (bmi < 30) return 'Overweight';
  return 'Obese';
}

function calculateBmi(weight: number, totalInches: number): number {
  return (weight / (totalInches * totalInches)) * BMI_IMPERIAL_FACTOR;
}

export default {
  data: new SlashCommandBuilder()
    .setName('bmicalculator')
    .setDescription('Calculate your BMI (Body Mass Index)')
    .addIntegerOption((option) => option.setName('feet').setDescription('Your height (feet)').setMinValue(0).setRequired(true))
    .addNumberOption((option) =>
      option.setName('inches').setDescription('Your remaining height in inches').setMinValue(0).setMaxValue(11.99).setRequired(true),
    )
    .addNumberOption((option) => option.setName('weight').setDescription('Your weight in pounds (lbs)').setMinValue(1).setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    const heightFt = interaction.options.getInteger('feet', true);
    const heightIn = interaction.options.getNumber('inches', true);
    const weight = interaction.options.getNumber('weight', true);

    if (weight <= 0 || heightFt < 0 || heightIn < 0 || heightIn >= INCHES_PER_FOOT) {
      await interaction.reply('Please enter valid weight and height values. Inches should be between 0 and 11.99.');
      return;
    }

    const totalInches = heightFt * INCHES_PER_FOOT + heightIn;
    if (totalInches <= 0) {
      await interaction.reply('Height must be greater than 0.');
      return;
    }

    const bmi = calculateBmi(weight, totalInches);
    const bmiRounded = bmi.toFixed(2);
    const category = getBmiCategory(bmi);
    const rangesTable = BMI_RANGES.map((range) => `**${range.label}:** ${range.range}`).join('\n');

    const embed = new EmbedBuilder()
      .setTitle('BMI Calculator')
      .setColor(EMBED_COLOR)
      .addFields(
        { name: 'Height', value: `${heightFt} ft ${heightIn} in (${totalInches} in)`, inline: true },
        { name: 'Weight', value: `${weight} lbs`, inline: true },
        { name: 'BMI', value: bmiRounded, inline: true },
        { name: 'Category', value: category, inline: false },
        { name: 'BMI Ranges', value: rangesTable, inline: false },
      );

    await interaction.reply({ embeds: [embed] });
  },
};
