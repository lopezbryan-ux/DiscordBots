import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { mongoClient } from '../../index.js';
import { CardioChoices } from '../../utils/cardioUtils/cardioChoices.js';
import { ValidateDistance, ValidateTime } from '../../utils/cardioUtils/cardioValidators.js';

const DATABASE_NAME = 'StrengthBotDb';
const CARDIO_COLLECTION = 'StrengthBotCardioCollection';
const LOG_CATEGORY = 'Cardio';
const RUN_COLOR = 0x1abc9c;
const DEFAULT_COLOR = 0x3498db;
const SECONDS_PER_MINUTE = 60;
const MAX_DETAILS_LENGTH = 1000;
const MAX_TIME_LENGTH = 5;

interface CardioLog {
  username: string;
  date: string;
  cardioType: string;
  time: string;
  distance: number;
  bodyweight: number;
  additionaldetails: string;
  logCategory: string;
}

function calculateMilePace(time: string, distance: number): string {
  const [minutes, seconds] = time.split(':').map(Number);

  if (Number.isNaN(minutes) || Number.isNaN(seconds) || distance <= 0) {
    return 'N/A';
  }

  const totalSeconds = minutes * SECONDS_PER_MINUTE + seconds;
  const paceSeconds = totalSeconds / distance;
  const paceMinutes = Math.floor(paceSeconds / SECONDS_PER_MINUTE);
  const paceRemainingSeconds = Math.round(paceSeconds % SECONDS_PER_MINUTE);

  return `${paceMinutes}:${paceRemainingSeconds.toString().padStart(2, '0')}`;
}

function getEmbedTitle(cardioType: string): string {
  if (cardioType === 'run') return 'Run Logged';
  if (cardioType === 'bike') return 'Bike Logged';
  return 'Cardio Log Saved';
}

export default {
  data: new SlashCommandBuilder()
    .setName('logcardio')
    .setDescription('Log a cardio activity')
    .addStringOption((option) =>
      option
        .setName('cardiotype')
        .setDescription('Type of cardio')
        .setRequired(true)
        .addChoices(...CardioChoices),
    )
    .addNumberOption((option) => option.setName('bodyweight').setDescription('Your body weight (lbs)').setMinValue(1).setRequired(true))
    .addStringOption((option) => option.setName('time').setDescription('Time (mm:ss)').setMaxLength(MAX_TIME_LENGTH).setRequired(true))
    .addNumberOption((option) => option.setName('distance').setDescription('Distance (miles)').setMinValue(0.01).setRequired(true))
    .addStringOption((option) =>
      option.setName('additionaldetails').setDescription('Additional details (optional)').setMaxLength(MAX_DETAILS_LENGTH).setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    try {
      const username = interaction.user.username;
      const date = new Date().toISOString().slice(0, 10);
      const cardioType = interaction.options.getString('cardiotype', true);
      const time = interaction.options.getString('time', true);
      const bodyweight = interaction.options.getNumber('bodyweight', true);
      const distance = interaction.options.getNumber('distance', true);
      const additionaldetails = interaction.options.getString('additionaldetails')?.trim() || '';

      if (!ValidateTime(time)) {
        await interaction.editReply('Please enter time in MM:SS format (e.g., 07:45).');
        return;
      }

      if (bodyweight <= 0) {
        await interaction.editReply('Please enter a valid body weight.');
        return;
      }

      if (!ValidateDistance(distance)) {
        await interaction.editReply('Please enter a valid distance greater than 0.');
        return;
      }

      const cardioCollection = mongoClient.db(DATABASE_NAME).collection<CardioLog>(CARDIO_COLLECTION);
      await cardioCollection.insertOne({
        username,
        date,
        cardioType,
        time,
        distance,
        bodyweight,
        additionaldetails,
        logCategory: LOG_CATEGORY,
      });

      const milePace = calculateMilePace(time, distance);
      const embed = new EmbedBuilder()
        .setTitle(getEmbedTitle(cardioType))
        .setColor(cardioType === 'run' ? RUN_COLOR : DEFAULT_COLOR)
        .addFields(
          { name: 'Distance', value: `${distance} miles`, inline: true },
          { name: 'Time', value: time, inline: true },
          { name: 'Bodyweight', value: `${bodyweight} lbs`, inline: true },
          { name: 'Date', value: date, inline: true },
          { name: 'Mile Pace', value: `${milePace} per mile`, inline: true },
        );

      if (additionaldetails) {
        embed.addFields({ name: 'Details', value: additionaldetails, inline: false });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Error in logCardio command:', err);
      await interaction.editReply('There was an error while executing this command.');
    }
  },
};
