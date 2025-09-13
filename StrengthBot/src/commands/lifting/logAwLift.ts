import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';

import { ArmWrestlingLifts } from '../../utils/liftChoices.js';
import { MongoClient } from 'mongodb';

export default {
  data: new SlashCommandBuilder()
    .setName('logawlift')
    .setDescription('Log an Armwrestling lift')
    .addStringOption((option) =>
      option
        .setName('exercise')
        .setDescription('Armwrestling exercise')
        .setRequired(true)
        .addChoices(...ArmWrestlingLifts),
    )
    .addNumberOption((option) => option.setName('amount').setDescription('Amount lifted(lbs)').setRequired(true))
    .addNumberOption((option) => option.setName('bodyweight').setDescription('Your body weight(lbs)').setRequired(true))
    .addStringOption((option) => option.setName('additionaldetails').setDescription('Additional details (optional)').setRequired(false)),
  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const username = chatInteraction.user.username;
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD in UTC
    const exercise = chatInteraction.options.getString('exercise', true);
    const amount = chatInteraction.options.getNumber('amount', true);
    const bodyweight = chatInteraction.options.getNumber('bodyweight', true);
    const additionaldetails = chatInteraction.options.getString('additionaldetails') || '';
    const liftCategory = 'ArmWrestling';
    const logEntry = {
      username,
      date,
      exercise,
      amount,
      bodyweight,
      additionaldetails,
      liftCategory,
    };

    // Insert the lift into MongoDB
    const uri =
      'mongodb+srv://***REMOVED***'; // Replace with your actual connection string
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('StrengthBotDb');
    const liftsCollection = db.collection('StrengthBotCollection');
    await liftsCollection.insertOne({
      username,
      date,
      exercise,
      amount,
      bodyweight,
      additionaldetails: additionaldetails,
      liftCategory,
    });
    await client.close();

    await interaction.reply(
      `Logged: ${exercise} - ${amount}lbs @ ${bodyweight}lbs bodyweight on ${date} ${additionaldetails ? `(${additionaldetails})` : ''}`,
    );
  },
};
