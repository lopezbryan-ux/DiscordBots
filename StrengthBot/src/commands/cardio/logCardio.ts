import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';
import { mongoClient } from '../../index.js';
import { ValidateTime, ValidateDistance } from '../../utils/cardioUtils/cardioValidators.js';
import { CardioChoices } from '../../utils/cardioUtils/cardioChoices.js';

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
    .addNumberOption((option) => option.setName('bodyweight').setDescription('Your body weight (lbs)').setRequired(true))
    .addStringOption((option) => option.setName('time').setDescription('Time (mm:ss)').setRequired(true))
    .addNumberOption((option) => option.setName('distance').setDescription('Distance (miles)').setRequired(true))
    .addStringOption((option) => option.setName('additionaldetails').setDescription('Additional details (optional)').setRequired(false)),
  async execute(interaction: CommandInteraction<CacheType>) {
    await interaction.deferReply();
    try {
      const chatInteraction = interaction as ChatInputCommandInteraction;
      const username = chatInteraction.user.username;
      const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const cardioType = chatInteraction.options.getString('cardio_type', true);
      const time = chatInteraction.options.getString('time', true);
      const timeError = !ValidateTime(time);
      if (timeError) {
        await interaction.editReply('Please enter time in MM:SS format (e.g., 07:45).');
        return;
      }
      const bodyweight = chatInteraction.options.getNumber('bodyweight', true);
      const distance = chatInteraction.options.getNumber('distance', true);
      const additionaldetails = chatInteraction.options.getString('additionaldetails') || '';
      const logCategory = 'Cardio';

      // Validate distance
      if (!ValidateDistance(distance)) {
        await interaction.editReply('Please enter a valid distance greater than 0.');
        return;
      }

      // Insert the cardio log into MongoDB
      const db = mongoClient.db('StrengthBotDb');
      const cardioCollection = db.collection('StrengthBotCardioCollection');
      await cardioCollection.insertOne({
        username,
        date,
        cardioType,
        time,
        distance,
        bodyweight,
        additionaldetails,
        logCategory,
      });

      // Calculate mile pace (mm:ss per mile)
      function calcMilePace(timeStr: string, dist: number): string {
        const [min, sec] = timeStr.split(':').map(Number);
        if (isNaN(min) || isNaN(sec) || dist <= 0) return 'N/A';
        const totalSeconds = min * 60 + sec;
        const paceSeconds = totalSeconds / dist;
        const paceMin = Math.floor(paceSeconds / 60);
        const paceSec = Math.round(paceSeconds % 60);
        return `${paceMin}:${paceSec.toString().padStart(2, '0')}`;
      }

      let replyMsg = '';
      if (cardioType === 'run') {
        const milePace = calcMilePace(time, distance);
        replyMsg = `Logged: Run - ${distance} miles in ${time} @ ${bodyweight}lbs on ${date} | Mile Pace: ${milePace} per mile`;
      } else if (cardioType === 'bike') {
        const milePace = calcMilePace(time, distance);
        replyMsg = `Logged: Bike - ${distance} miles in ${time} @ ${bodyweight}lbs on ${date} | Mile Pace: ${milePace} per mile`;
      }
      if (additionaldetails) replyMsg += ` (${additionaldetails})`;

      if (!replyMsg) replyMsg = 'Cardio log saved.';
      await interaction.editReply(replyMsg);
    } catch (err) {
      console.error('Error in logCardio command:', err);
      await interaction.editReply('There was an error while executing this command!');
    }
  },
};
