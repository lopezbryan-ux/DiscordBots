import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';
import { strengthStandards, StrengthLevel, QuickChartConfig, strengthStandardsColumns } from '../../../utils/liftingUtils/strengthStandards.js';

export default {
  data: new SlashCommandBuilder().setName('strengthstandards').setDescription('View strength standards for squat, bench, and deadlift'),
  async execute(interaction: CommandInteraction<CacheType>) {
    const levels: StrengthLevel[] = ['Beginner', 'Intermediate', 'Advanced', 'Elite', 'Freak'];
    const lifts = Object.keys(strengthStandards);
    const embed = new EmbedBuilder()
      .setTitle('🏋️ Strength Standards')
      .setColor(0x8e44ad)
      .setDescription('Standards are based on bodyweight (BW) for male lifters.');

    // QuickChart API payload
    const quickChartConfig: QuickChartConfig = {
      columns: strengthStandardsColumns,
      dataSource: ['-', strengthStandards[0], strengthStandards[1], strengthStandards[2]],
    };

    const quickChartUrl = `https://api.quickchart.io/v1/table?data=${encodeURIComponent(JSON.stringify(quickChartConfig))}`;

    embed.setImage(quickChartUrl);

    try {
      const chatInteraction = interaction as ChatInputCommandInteraction;
      const username = chatInteraction.user.username;
      const db = (await import('../../../index.js')).mongoClient.db('StrengthBotDb');
      const liftsCollection = db.collection('StrengthBotCollection');

      // Find max squat, bench, deadlift for this user
      const squatLog = await liftsCollection.find({ username, exercise: 'Barbell Squat' }).sort({ amount: -1 }).limit(1).toArray();
      const benchLog = await liftsCollection.find({ username, exercise: 'Barbell Bench' }).sort({ amount: -1 }).limit(1).toArray();
      const deadliftLog = await liftsCollection.find({ username, exercise: 'Barbell Deadlift' }).sort({ amount: -1 }).limit(1).toArray();

      // Use the bodyweight from the highest lift, fallback to 1 if missing
      const squatMax = squatLog[0]?.amount ?? 0;
      const benchMax = benchLog[0]?.amount ?? 0;
      const deadliftMax = deadliftLog[0]?.amount ?? 0;
      const bodyweight = squatLog[0]?.bodyweight ?? benchLog[0]?.bodyweight ?? deadliftLog[0]?.bodyweight ?? 1;

      // Calculate ratios
      const squatRatio = bodyweight ? (squatMax / bodyweight).toFixed(2) : 'N/A';
      const benchRatio = bodyweight ? (benchMax / bodyweight).toFixed(2) : 'N/A';
      const deadliftRatio = bodyweight ? (deadliftMax / bodyweight).toFixed(2) : 'N/A';

      // Helper to determine strength level
      function getStrengthLevel(lift: string, ratio: number): string {
        // Find the standards object for the lift
        const standards = strengthStandards.find((s) => s.lift.toLowerCase() === lift.toLowerCase());
        if (!standards) {
          interaction.reply({ content: `Debug: No standards found for ${lift}` });
          return 'Unknown';
        }
        if (!standards) return 'Unknown';
        for (const level of levels) {
          // The key in standards is always lowercase
          const key = level.toLowerCase();
          const val = standards[key as keyof typeof standards] as string;
          if (!val) continue;
          // Handle ranges like '1.25-1.75X BW'
          const match = val.match(/([\d.]+)(?:-(\d+.?\d*)|)X/);
          if (match) {
            const min = parseFloat(match[1]);
            const max = match[2] ? parseFloat(match[2]) : min;
            if (ratio >= min && ratio <= max) return level;
          } else if (val.includes('+')) {
            // e.g. '3X+ BW'
            const plusMatch = val.match(/([\d.]+)X\+/);
            if (plusMatch && ratio >= parseFloat(plusMatch[1])) return level;
          } else {
            // e.g. '1X BW'
            const singleMatch = val.match(/([\d.]+)X/);
            if (singleMatch && Math.abs(ratio - parseFloat(singleMatch[1])) < 0.15) return level;
          }
        }
        return 'Below Beginner';
      }
      const typeForSuqatRatio = typeof squatRatio;
      // Build summary string with level
      const squatLevel = typeof squatRatio !== 'string' ? 'Unknown' : getStrengthLevel('Squat', Number(squatRatio));
      const benchLevel = typeof benchRatio !== 'string' ? 'Unknown' : getStrengthLevel('Bench', Number(benchRatio));
      const deadliftLevel = typeof deadliftRatio !== 'string' ? 'Unknown' : getStrengthLevel('Deadlift', Number(deadliftRatio));

      let summary = `\n`;
      summary += `Barbell Squat: **${squatMax} lbs** (${squatRatio}x BW) — **${squatLevel}**\n`;
      summary += `Barbell Bench: **${benchMax} lbs** (${benchRatio}x BW) — **${benchLevel}**\n`;
      summary += `Barbell Deadlift: **${deadliftMax} lbs** (${deadliftRatio}x BW) — **${deadliftLevel}**`;

      // Add the summary as a field to the embed
      embed.addFields({ name: 'Your All Time Maxes, Ratios & Level', value: summary, inline: false });

      // Reply with the combined embed
      await interaction.reply({ embeds: [embed] });
    } catch (err: any) {
      await interaction.reply({ content: `❌ Error fetching your maxes: ${err instanceof Error ? err.message : String(err)}` });
    }
  },
};
