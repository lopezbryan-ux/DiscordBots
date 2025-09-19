import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';

import { CompoundLifts, ArmWrestlingLifts } from '../../utils/liftingUtils/liftChoices.js';
import { mongoClient } from '../../index.js';

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

    // Get user's lifts for the exercise from MongoDB
    interface LiftEntry {
      date: string;
      amount: number;
    }
    // Use shared MongoDB client
    const db = mongoClient.db('StrengthBotDb');
    const liftsCollection = db.collection('StrengthBotCollection');
    const rawLifts = await liftsCollection.find({ username, exercise }).sort({ date: 1 }).toArray();
    const lifts: LiftEntry[] = rawLifts.map((doc) => ({
      date: doc.date,
      amount: doc.amount,
    }));
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
