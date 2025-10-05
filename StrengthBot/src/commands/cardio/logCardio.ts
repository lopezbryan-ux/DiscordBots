import { SlashCommandBuilder } from 'discord.js';
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
      const cardioType = chatInteraction.options.getString('cardiotype', true);
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

      let embedTitle = '';
      let embedFields = [];
      const embedColor = cardioType === 'run' ? 0x1abc9c : 0x3498db;
      const milePace = calcMilePace(time, distance);
      if (cardioType === 'run') {
        embedTitle = '🏃 Run Logged';
      } else if (cardioType === 'bike') {
        embedTitle = '🚴 Bike Logged';
      } else {
        embedTitle = 'Cardio Log Saved';
      }
      embedFields = [
        { name: 'Distance', value: `${distance} miles`, inline: true },
        { name: 'Time', value: time, inline: true },
        { name: 'Bodyweight', value: `${bodyweight} lbs`, inline: true },
        { name: 'Date', value: date, inline: true },
        { name: 'Mile Pace', value: `${milePace} per mile`, inline: true },
      ];
      if (additionaldetails) {
        embedFields.push({ name: 'Details', value: additionaldetails, inline: false });
      }
      await interaction.editReply({
        embeds: [{
          title: embedTitle,
          color: embedColor,
          fields: embedFields,
        }],
      });
    } catch (err) {
      console.error('Error in logCardio command:', err);
      await interaction.editReply(`There was an error while executing this comman123d!\nError: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
