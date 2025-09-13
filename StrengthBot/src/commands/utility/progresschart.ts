import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';

import { CompoundLifts, ArmWrestlingLifts } from '../../utils/liftChoices.js';
import db from '../../utils/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('progresschart')
    .setDescription('Show your progress chart for a specific exercise')
    .addStringOption((option) =>
      option
        .setName('exercise')
        .setDescription('Exercise to chart')
        .setRequired(true)
        .addChoices(...CompoundLifts, ...ArmWrestlingLifts),
    ),
  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const username = chatInteraction.user.username;
    const exercise = chatInteraction.options.getString('exercise', true);

    // Get user's lifts for the exercise
    interface LiftEntry {
      date: string;
      amount: number;
    }
    const lifts = db
      .prepare('SELECT date, amount FROM lifts WHERE username = ? AND exercise = ? ORDER BY date ASC')
      .all(username, exercise) as LiftEntry[];
    if (lifts.length === 0) {
      await interaction.reply('No lifts found for this exercise.');
      return;
    }

    // Prepare data for chart
    const labels = lifts.map((l) => l.date);
    const data = lifts.map((l) => l.amount);

    // QuickChart API payload
    const chartConfig = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: `${exercise} Progress`,
            data,
            fill: false,
            borderColor: 'rgb(75, 192, 192)',
            tension: 0.1,
          },
        ],
      },
      options: {
        scales: {
          xAxes: [
            {
              scaleLabel: {
                display: true,
                labelString: 'Date',
                fontSize: 16,
              },
            },
          ],
          yAxes: [
            {
              scaleLabel: {
                display: true,
                labelString: 'Weight (lbs)',
                fontSize: 16,
              },
            },
          ],
        },
      },
    };

    const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}`;
    await interaction.reply({
      embeds: [
        {
          title: `${exercise} Progress Chart`,
          image: { url: chartUrl },
          color: 0x00bfff,
        },
      ],
    });
  },
};
