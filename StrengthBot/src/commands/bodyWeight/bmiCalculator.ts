import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';

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
    .addNumberOption((option) => option.setName('weight').setDescription('Your weight in pounds (lbs)').setRequired(true))
    .addIntegerOption((option) => option.setName('heightft').setDescription('Your height (feet)').setRequired(true))
    .addNumberOption((option) => option.setName('heightin').setDescription('Your height (inches)').setRequired(true)),
  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const weight = chatInteraction.options.getNumber('weight', true);
    const heightFt = chatInteraction.options.getInteger('heightft', true);
    const heightIn = chatInteraction.options.getNumber('heightin', true);
    if (weight <= 0 || heightFt < 0 || heightIn < 0) {
      await interaction.reply('Please enter valid weight and height values.');
      return;
    }
    const totalInches = heightFt * 12 + heightIn;
    if (totalInches <= 0) {
      await interaction.reply('Height must be greater than 0.');
      return;
    }
    // BMI formula for imperial units: (weight in lbs / (height in inches)^2) * 703
    const bmi = (weight / (totalInches * totalInches)) * 703;
    const bmiRounded = bmi.toFixed(2);
    const category = getBmiCategory(bmi);

    const bmiRanges = [
      { range: '< 18.5', label: 'Underweight' },
      { range: '18.5 - 24.9', label: 'Normal weight' },
      { range: '25 - 29.9', label: 'Overweight' },
      { range: '30+', label: 'Obese' },
    ];

    const rangesTable = bmiRanges.map((r) => `**${r.label}:** ${r.range}`).join('\n');

    const embed = new EmbedBuilder()
      .setTitle('🧮 BMI Calculator')
      .setColor(0x8e44ad)
      .addFields(
        { name: 'Weight', value: `${weight} lbs`, inline: true },
        { name: 'Height', value: `${heightFt} ft ${heightIn} in (${totalInches} in)`, inline: true },
        { name: 'BMI', value: `${bmiRounded}`, inline: true },
        { name: 'Category', value: category, inline: false },
        { name: 'BMI Ranges', value: rangesTable, inline: false },
      );

    await interaction.reply({ embeds: [embed] });
  },
};
