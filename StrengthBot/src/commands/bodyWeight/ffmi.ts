import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';

/**
 * Calculates Fat-Free Mass Index (FFMI)
 * @param weightLbs Weight in pounds
 * @param heightIn Height in inches
 * @param bodyFatPercent Body fat percentage (0-100)
 * @returns FFMI value
 */
function calculateFFMI(weightLbs: number, heightIn: number, bodyFatPercent: number): number {
  // Convert weight to kg and height to meters
  const weightKg = weightLbs * 0.453592;
  const heightM = heightIn * 0.0254;
  // Fat-free mass (kg)
  const ffm = weightKg * (1 - bodyFatPercent / 100);
  // FFMI formula
  return ffm / (heightM * heightM);
}

export default {
  data: new SlashCommandBuilder()
    .setName('ffmi')
    .setDescription('Calculate your Fat-Free Mass Index (FFMI)')
    .addNumberOption((option) => option.setName('weight').setDescription('Your weight in pounds (lbs)').setRequired(true))
    .addIntegerOption((option) => option.setName('heightft').setDescription('Your height (feet)').setRequired(true))
    .addNumberOption((option) => option.setName('heightin').setDescription('Your height (inches)').setRequired(true))
    .addNumberOption((option) => option.setName('bodyfat').setDescription('Your body fat percentage (e.g. 15)').setRequired(true)),
  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const weight = chatInteraction.options.getNumber('weight', true);
    const heightFt = chatInteraction.options.getInteger('heightft', true);
    const heightIn = chatInteraction.options.getNumber('heightin', true);
    const bodyFat = chatInteraction.options.getNumber('bodyfat', true);
    if (weight <= 0 || heightFt < 0 || heightIn < 0 || bodyFat < 0 || bodyFat > 100) {
      await interaction.reply('Please enter valid weight, height, and body fat percentage values.');
      return;
    }
    const totalInches = heightFt * 12 + heightIn;
    if (totalInches <= 0) {
      await interaction.reply('Height must be greater than 0.');
      return;
    }
    const ffmi = calculateFFMI(weight, totalInches, bodyFat);
    const ffmiRounded = ffmi.toFixed(2);

    const ffmiRanges = [
      { range: '< 17', label: 'Below average' },
      { range: '17 - 19', label: 'Average' },
      { range: '20 - 21', label: 'Above average' },
      { range: '22 - 23', label: 'Excellent' },
      { range: '24 - 25', label: 'Superior (natural limit)' },
      { range: '> 25', label: 'Likely enhanced (not natural)' },
    ];
    const rangesTable = ffmiRanges.map((r) => `**${r.label}:** ${r.range}`).join('\n');

    const embed = new EmbedBuilder()
      .setTitle('💪 FFMI Calculator')
      .setColor(0x27ae60)
      .addFields(
        { name: 'Weight', value: `${weight} lbs`, inline: true },
        { name: 'Height', value: `${heightFt} ft ${heightIn} in (${totalInches} in)`, inline: true },
        { name: 'Body Fat %', value: `${bodyFat}%`, inline: true },
        { name: 'FFMI', value: `${ffmiRounded}`, inline: false },
        { name: 'FFMI Index Values', value: rangesTable, inline: false },
      )
      .setFooter({ text: 'FFMI = Fat-Free Mass Index. 25+ is considered very high for natural athletes.' });

    await interaction.reply({ embeds: [embed] });
  },
};
