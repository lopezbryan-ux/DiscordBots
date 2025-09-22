import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';
import { strengthStandards, StrengthLevel, QuickChartConfig } from '../../../utils/liftingUtils/strengthStandards.js';

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
      columns: [
        { title: '', dataIndex: 'lift' },
        { title: 'Beginner', dataIndex: 'beginner' },
        { title: 'Intermediate', dataIndex: 'intermediate' },
        { title: 'Advanced', dataIndex: 'advanced' },
        { title: 'Elite', dataIndex: 'elite' },
        { title: 'Freak', dataIndex: 'freak' },
      ],
      dataSource: strengthStandards,
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

      // Build summary string
      let summary = `\n`;
      summary += `Barbell Squat: **${squatMax} lbs** (${squatRatio}x BW)\n`;
      summary += `Barbell Bench: **${benchMax} lbs** (${benchRatio}x BW)\n`;
      summary += `Barbell Deadlift: **${deadliftMax} lbs** (${deadliftRatio}x BW)`;

      // Add the summary as a field to the embed
      embed.addFields({ name: 'Your All Time Maxes & Ratios', value: summary, inline: false });

      // Reply with the combined embed
      await interaction.reply({ embeds: [embed] });
    } catch (err: any) {
      await interaction.reply({ content: `❌ Error fetching your maxes: ${err instanceof Error ? err.message : String(err)}` });
    }
  },
};
