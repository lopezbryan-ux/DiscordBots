import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';
import { mongoClient } from '../../index.js';

export default {
  data: new SlashCommandBuilder()
    .setName('logmiletime')
    .setDescription('Log your mile run time')
    .addStringOption((option) => option.setName('mile_time').setDescription('Your mile time (mm:ss)').setRequired(true))
    .addNumberOption((option) => option.setName('bodyweight').setDescription('Your body weight (lbs)').setRequired(true))
    .addStringOption((option) => option.setName('additionaldetails').setDescription('Additional details (optional)').setRequired(false)),
  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const username = chatInteraction.user.username;
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const mileTime = chatInteraction.options.getString('mile_time', true);
    const bodyweight = chatInteraction.options.getNumber('bodyweight', true);
    const additionaldetails = chatInteraction.options.getString('additionaldetails') || '';
    const logCategory = 'Cardio';

    // Insert the cardio log into MongoDB
    const db = mongoClient.db('StrengthBotDb');
    const cardioCollection = db.collection('StrengthBotCardioCollection');
    await cardioCollection.insertOne({
      username,
      date,
      mileTime,
      bodyweight,
      additionaldetails,
      logCategory,
    });

    await interaction.reply(
      `Logged: Mile Time - ${mileTime} @ ${bodyweight}lbs bodyweight on ${date} ${additionaldetails ? `(${additionaldetails})` : ''}`,
    );
  },
};
