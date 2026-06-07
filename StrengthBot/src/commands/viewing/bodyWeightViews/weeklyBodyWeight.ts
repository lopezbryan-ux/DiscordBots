import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { mongoClient } from '../../../index.js';
import { BODY_WEIGHT_COLLECTION, BodyWeightLog, DATABASE_NAME } from '../../../utils/viewingUtils/viewHelpers.js';

const EMBED_COLOR = 0x2ecc71;
const DAYS_PER_WEEK = 7;
const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_SECOND = 1000;

function getWeekKey(dateValue: string): string {
  const date = new Date(dateValue);
  const year = date.getUTCFullYear();
  const firstJan = new Date(Date.UTC(year, 0, 1));
  const dayMilliseconds = HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;
  const days = Math.floor((date.getTime() - firstJan.getTime()) / dayMilliseconds);
  const week = Math.ceil((days + firstJan.getUTCDay() + 1) / DAYS_PER_WEEK);

  return `${year}-W${week.toString().padStart(2, '0')}`;
}

export default {
  data: new SlashCommandBuilder().setName('weeklybodyweight').setDescription('View your weekly average body weight'),

  async execute(interaction: ChatInputCommandInteraction) {
    const username = interaction.user.username;
    const bodyWeightCollection = mongoClient.db(DATABASE_NAME).collection<BodyWeightLog>(BODY_WEIGHT_COLLECTION);
    const logs = await bodyWeightCollection.find({ username }).sort({ date: 1 }).toArray();

    if (logs.length === 0) {
      await interaction.reply('No body weight logs found.');
      return;
    }

    const weekMap = new Map<string, number[]>();
    for (const log of logs) {
      const weekKey = getWeekKey(log.date);
      const weights = weekMap.get(weekKey) || [];
      weights.push(log.bodyweight);
      weekMap.set(weekKey, weights);
    }

    const weekAverages = [...weekMap.entries()].map(([week, weights]) => ({
      week,
      average: Number((weights.reduce((total, weight) => total + weight, 0) / weights.length).toFixed(2)),
    }));

    const chartConfig = {
      type: 'line',
      data: {
        labels: weekAverages.map((entry) => entry.week),
        datasets: [
          {
            label: 'Weekly Avg Body Weight',
            data: weekAverages.map((entry) => entry.average),
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
    const embed = new EmbedBuilder()
      .setTitle('Weekly Average Body Weight')
      .setColor(EMBED_COLOR)
      .setDescription(`User: **${username}**`)
      .setImage(chartUrl);

    await interaction.reply({ embeds: [embed] });
  },
};
