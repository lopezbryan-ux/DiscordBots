import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { oneRepMaxFormulas } from '../../../utils/liftingUtils/formulas.js';

const formulaChoices = [
  ...Object.entries(oneRepMaxFormulas).map(([key, formula]) => ({
    name: formula.name,
    value: key,
  })),
  { name: 'Average of All', value: 'average' },
];

export default {
  data: new SlashCommandBuilder()
    .setName('onerepmax')
    .setDescription('Calculate your estimated one-rep max (1RM) with various formulas')
    .addNumberOption((option) => option.setName('weight').setDescription('Weight lifted (lbs)').setRequired(true))
    .addIntegerOption((option) => option.setName('reps').setDescription('Number of reps performed').setRequired(true))
    .addStringOption((option) =>
      option
        .setName('formula')
        .setDescription('Formula to use')
        .setRequired(false) // Make formula optional
        .addChoices(...formulaChoices),
    ),
  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const weight = chatInteraction.options.getNumber('weight', true);
    const reps = chatInteraction.options.getInteger('reps', true);
    const formulaKey = chatInteraction.options.getString('formula') ?? 'average'; // Default if not provided

    if (reps < 1 || weight <= 0) {
      await interaction.reply('Please enter a valid weight and at least 1 rep.');
      return;
    }

    if (formulaKey === 'average') {
      const results = Object.entries(oneRepMaxFormulas).map(([key, formula]) => ({
        name: formula.name,
        value: formula.calc(weight, reps),
        desc: formula.desc,
      }));
      const avg = results.reduce((sum, r) => sum + r.value, 0) / results.length;

      const embed = new EmbedBuilder()
        .setTitle('🧮 One-Rep Max Calculator (Average of All)')
        .setColor(0x2196f3)
        .setDescription(
          `**Weight:** ${weight} lbs\n**Reps:** ${reps}\n\n` +
            results.map((r) => `**${r.name}:** ${r.value.toFixed(2)} lbs`).join('\n') +
            `\n\n**Average 1RM:** ${avg.toFixed(2)} lbs`,
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    const formula = oneRepMaxFormulas[formulaKey as keyof typeof oneRepMaxFormulas];
    if (!formula) {
      await interaction.reply('Invalid formula selected.');
      return;
    }

    let oneRepMax = formula.calc(weight, reps);

    const embed = new EmbedBuilder()
      .setTitle(`🧮 One-Rep Max Calculator (${formula.name})`)
      .setColor(0x4caf50)
      .setDescription(`**Weight:** ${weight} lbs\n**Reps:** ${reps}\n**Formula:** ${formula.desc}\n\n**Estimated 1RM:** ${oneRepMax.toFixed(2)} lbs`);

    await interaction.reply({ embeds: [embed] });
  },
};
