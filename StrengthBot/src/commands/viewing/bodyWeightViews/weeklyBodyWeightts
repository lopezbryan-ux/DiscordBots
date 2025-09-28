import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';
import { mongoClient } from '../../../index.js';

function getWeekKey(dateStr: string) {
  const date = new Date(dateStr);
  // Get ISO week number
  const year = date.getUTCFullYear();
  const firstJan = new Date(Date.UTC(year, 0, 1));
  const days = Math.floor((date.getTime() - firstJan.getTime()) / (24 * 60 * 60 * 1000));
  const week = Math.ceil((days + firstJan.getUTCDay() + 1) / 7);
  return `${year}-W${week.toString().padStart(2, '0')}`;
}

export default {
  data: new SlashCommandBuilder().setName('weeklybodyweight').setDescription('View your weekly average body weight'),
  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const username = chatInteraction.user.username;
    const db = mongoClient.db('StrengthBotDb');
    const bodyWeightCollection = db.collection('StrengthBotBodyWeight');
    const logs = await bodyWeightCollection.find({ username }).sort({ date: 1 }).toArray();
    if (!logs.length) {
      await interaction.reply('No body weight logs found.');
      return;
    }

    // Group by week
    const weekMap: Record<string, number[]> = {};
    for (const log of logs) {
      const weekKey = getWeekKey(log.date);
      if (!weekMap[weekKey]) weekMap[weekKey] = [];
      weekMap[weekKey].push(log.bodyweight);
    }

    // Calculate averages
    const weekAverages = Object.entries(weekMap).map(([week, weights]) => ({
      week,
      avg: (weights.reduce((a, b) => a + b, 0) / weights.length).toFixed(2),
    }));

    // Prepare QuickChart line chart config
    const chartConfig = {
      type: 'line',
      data: {
        labels: weekAverages.map((w) => w.week),
        datasets: [
          {
            label: 'Weekly Avg Body Weight',
            data: weekAverages.map((w) => Number(w.avg)),
            fill: false,
            borderColor: '#000000',
            backgroundColor: '#000000',
            tension: 0.2,
          },
        ],
      },
      options: {
        plugins: {
          title: {
            display: true,
            text: 'Weekly Average Body Weight',
            font: { size: 20 },
          },
        },
        scales: {
          x: {
            title: { display: true, text: 'Week' },
          },
          y: {
            title: { display: true, text: 'Body Weight (lbs)' },
            beginAtZero: false,
          },
        },
      },
    };

    const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&backgroundColor=white`;

    // Build embed with chart image
    const embed = new EmbedBuilder()
      .setTitle('📊 Weekly Average Body Weight')
      .setColor(0x2ecc71)
      .setDescription(`User: **${username}**`)
      .setImage(chartUrl);

    await interaction.reply({ embeds: [embed] });
  },
};
