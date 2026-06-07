import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';

const POUNDS_TO_KILOGRAMS = 0.453592;
const INCHES_TO_METERS = 0.0254;
const INCHES_PER_FOOT = 12;
const EMBED_COLOR = 0x27ae60;

const FFMI_RANGES = [
  { range: '< 17', label: 'Below average' },
  { range: '17 - 19', label: 'Average' },
  { range: '20 - 21', label: 'Above average' },
  { range: '22 - 23', label: 'Excellent' },
  { range: '24 - 25', label: 'Superior (natural limit)' },
  { range: '> 25', label: 'Likely enhanced (not natural)' },
];

function calculateFFMI(weightLbs: number, heightIn: number, bodyFatPercent: number): number {
  const weightKg = weightLbs * POUNDS_TO_KILOGRAMS;
  const heightM = heightIn * INCHES_TO_METERS;
  const fatFreeMass = weightKg * (1 - bodyFatPercent / 100);

  return fatFreeMass / (heightM * heightM);
}

export default {
  data: new SlashCommandBuilder()
    .setName('ffmi')
    .setDescription('Calculate your Fat-Free Mass Index (FFMI)')
    .addNumberOption((option) =>
      option
        .setName('weight')
        .setDescription('Your weight in pounds (lbs)')
        .setMinValue(1)
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName('heightft')
        .setDescription('Your height (feet)')
        .setMinValue(0)
        .setRequired(true),
    )
    .addNumberOption((option) =>
      option
        .setName('heightin')
        .setDescription('Your remaining height in inches')
        .setMinValue(0)
        .setMaxValue(11.99)
        .setRequired(true),
    )
    .addNumberOption((option) =>
      option
        .setName('bodyfat')
        .setDescription('Your body fat percentage (e.g. 15)')
        .setMinValue(0)
        .setMaxValue(100)
        .setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const weight = interaction.options.getNumber('weight', true);
    const heightFt = interaction.options.getInteger('heightft', true);
    const heightIn = interaction.options.getNumber('heightin', true);
    const bodyFat = interaction.options.getNumber('bodyfat', true);

    if (weight <= 0 || heightFt < 0 || heightIn < 0 || heightIn >= INCHES_PER_FOOT || bodyFat < 0 || bodyFat > 100) {
      await interaction.reply('Please enter valid weight, height, and body fat percentage values.');
      return;
    }

    const totalInches = heightFt * INCHES_PER_FOOT + heightIn;
    if (totalInches <= 0) {
      await interaction.reply('Height must be greater than 0.');
      return;
    }

    const ffmi = calculateFFMI(weight, totalInches, bodyFat);
    const ffmiRounded = ffmi.toFixed(2);
    const rangesTable = FFMI_RANGES.map((range) => `**${range.label}:** ${range.range}`).join('\n');

    const embed = new EmbedBuilder()
      .setTitle('FFMI Calculator')
      .setColor(EMBED_COLOR)
      .addFields(
        { name: 'Weight', value: `${weight} lbs`, inline: true },
        { name: 'Height', value: `${heightFt} ft ${heightIn} in (${totalInches} in)`, inline: true },
        { name: 'Body Fat %', value: `${bodyFat}%`, inline: true },
        { name: 'FFMI', value: ffmiRounded, inline: false },
        { name: 'FFMI Index Values', value: rangesTable, inline: false },
      )
      .setFooter({ text: 'FFMI = Fat-Free Mass Index. 25+ is considered very high for natural athletes.' });

    await interaction.reply({ embeds: [embed] });
  },
};
