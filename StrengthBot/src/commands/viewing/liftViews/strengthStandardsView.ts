import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { mongoClient } from '../../../index.js';
import { QuickChartConfig, strengthStandards, strengthStandardsColumns, StrengthLevel } from '../../../utils/liftingUtils/strengthStandards.js';
import { DATABASE_NAME, LiftLog, LIFTS_COLLECTION } from '../../../utils/viewingUtils/viewHelpers.js';

const EMBED_COLOR = 0x8e44ad;
const LEVELS: StrengthLevel[] = ['Beginner', 'Intermediate', 'Advanced', 'Elite', 'Freak'];

function getStrengthLevel(lift: string, ratio: number): string {
  const standards = strengthStandards.find((standard) => standard.lift.toLowerCase() === lift.toLowerCase());
  if (!standards) return 'Unknown';

  for (const level of LEVELS) {
    const value = standards[level.toLowerCase() as keyof typeof standards] as string;
    if (!value) continue;

    const rangeMatch = value.match(/([\d.]+)(?:-([\d.]+))?X/);
    if (rangeMatch) {
      const min = Number(rangeMatch[1]);
      const max = rangeMatch[2] ? Number(rangeMatch[2]) : min;
      if (value.includes('+') && ratio >= min) return level;
      if (ratio >= min && ratio <= max) return level;
    }
  }

  return 'Below Beginner';
}

function formatRatio(max: number, bodyweight: number): string {
  if (max <= 0 || bodyweight <= 0) return 'N/A';

  return (max / bodyweight).toFixed(2);
}

function formatLevel(lift: string, ratio: string): string {
  if (ratio === 'N/A') return 'N/A';

  return getStrengthLevel(lift, Number(ratio));
}

export default {
  data: new SlashCommandBuilder().setName('strengthstandards').setDescription('View strength standards for squat, bench, and deadlift'),

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const username = interaction.user.username;
      const quickChartConfig: QuickChartConfig = {
        columns: strengthStandardsColumns,
        dataSource: ['-', strengthStandards[0], strengthStandards[1], strengthStandards[2]],
      };
      const quickChartUrl = `https://api.quickchart.io/v1/table?data=${encodeURIComponent(JSON.stringify(quickChartConfig))}`;
      const liftsCollection = mongoClient.db(DATABASE_NAME).collection<LiftLog>(LIFTS_COLLECTION);

      const [squatLog, benchLog, deadliftLog] = await Promise.all([
        liftsCollection.find({ username, exercise: 'Barbell Squat' }).sort({ amount: -1 }).limit(1).toArray(),
        liftsCollection.find({ username, exercise: 'Barbell Bench' }).sort({ amount: -1 }).limit(1).toArray(),
        liftsCollection.find({ username, exercise: 'Barbell Deadlift' }).sort({ amount: -1 }).limit(1).toArray(),
      ]);

      const squatMax = squatLog[0]?.amount ?? 0;
      const benchMax = benchLog[0]?.amount ?? 0;
      const deadliftMax = deadliftLog[0]?.amount ?? 0;
      const bodyweight = squatLog[0]?.bodyweight ?? benchLog[0]?.bodyweight ?? deadliftLog[0]?.bodyweight ?? 0;
      const squatRatio = formatRatio(squatMax, bodyweight);
      const benchRatio = formatRatio(benchMax, bodyweight);
      const deadliftRatio = formatRatio(deadliftMax, bodyweight);
      const total = benchMax + squatMax + deadliftMax;

      const summary = [
        `Barbell Bench: **${benchMax} lbs** (${benchRatio}x BW) - **${formatLevel('Bench', benchRatio)}**`,
        `Barbell Squat: **${squatMax} lbs** (${squatRatio}x BW) - **${formatLevel('Squat', squatRatio)}**`,
        `Barbell Deadlift: **${deadliftMax} lbs** (${deadliftRatio}x BW) - **${formatLevel('Deadlift', deadliftRatio)}**`,
        '',
        `**Total (Bench + Squat + Deadlift): ${total} lbs**`,
      ].join('\n');

      const embed = new EmbedBuilder()
        .setTitle('Strength Standards')
        .setColor(EMBED_COLOR)
        .setDescription('Standards are based on bodyweight (BW) for male lifters.')
        .setImage(quickChartUrl)
        .addFields({ name: 'Your All Time Maxes, Ratios & Level', value: summary, inline: false });

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Error in strengthstandards command:', err);
      await interaction.reply({ content: 'Error fetching your maxes.' });
    }
  },
};
