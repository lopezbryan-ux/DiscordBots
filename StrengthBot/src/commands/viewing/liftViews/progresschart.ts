import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { mongoClient } from '../../../index.js';
import { ArmWrestlingLifts, CompoundLifts } from '../../../utils/liftingUtils/liftChoices.js';
import { DATABASE_NAME, LiftLog, LIFTS_COLLECTION } from '../../../utils/viewingUtils/viewHelpers.js';

const EMBED_COLOR = 0x00bfff;

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

  async execute(interaction: ChatInputCommandInteraction) {
    const username = interaction.user.username;
    const exercise = interaction.options.getString('exercise', true);
    const liftsCollection = mongoClient.db(DATABASE_NAME).collection<LiftLog>(LIFTS_COLLECTION);
    const lifts = await liftsCollection.find({ username, exercise }).sort({ date: 1 }).toArray();

    if (lifts.length === 0) {
      await interaction.reply('No lifts found for this exercise.');
      return;
    }

    const chartConfig = {
      type: 'line',
      data: {
        labels: lifts.map((lift) => lift.date),
        datasets: [
          {
            label: `${exercise} Progress`,
            data: lifts.map((lift) => lift.amount),
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
    const embed = new EmbedBuilder().setTitle(`${exercise} Progress Chart`).setColor(EMBED_COLOR).setImage(chartUrl);

    await interaction.reply({ embeds: [embed] });
  },
};
