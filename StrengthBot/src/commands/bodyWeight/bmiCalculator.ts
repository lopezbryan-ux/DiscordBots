import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';

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

export default {
  data: new SlashCommandBuilder()
    .setName('bmicalculator')
    .setDescription('Calculate your BMI (Body Mass Index)')
    .addIntegerOption((option) => option.setName('feet').setDescription('Your height (feet)').setRequired(true))
    .addNumberOption((option) => option.setName('inches').setDescription('Your height (inches)').setRequired(true))
    .addNumberOption((option) => option.setName('weight').setDescription('Your weight in pounds (lbs)').setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    const heightFt = interaction.options.getInteger('feet', true);
    const heightIn = interaction.options.getNumber('inches', true);
    const weight = interaction.options.getNumber('weight', true);

    if (weight <= 0 || heightFt < 0 || heightIn < 0 || heightIn >= 12) {
      await interaction.reply('Please enter valid weight and height values. Inches should be between 0 and 11.99.');
      return;
    }

    const totalInches = heightFt * 12 + heightIn;
    if (totalInches <= 0) {
      await interaction.reply('Height must be greater than 0.');
      return;
    }

    const bmi = (weight / (totalInches * totalInches)) * 703;
    const bmiRounded = bmi.toFixed(2);
    const category = getBmiCategory(bmi);
    const rangesTable = BMI_RANGES.map((r) => `**${r.label}:** ${r.range}`).join('\n');

    const embed = new EmbedBuilder()
      .setTitle('🧮 BMI Calculator')
      .setColor(0x8e44ad)
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
