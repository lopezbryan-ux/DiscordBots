import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { validateAmount, validateBodyweight } from '../../utils/liftingUtils/validations.js';
import { CompoundLifts, LiftingCategories } from '../../utils/liftingUtils/liftChoices.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';

import { mongoClient } from '../../index.js';

export default {
  data: new SlashCommandBuilder()
    .setName('logcompoundlift')
    .setDescription('Log a lift')
    .addStringOption((option) =>
      option
        .setName('exercise')
        .setDescription('Exercise name')
        .setRequired(true)
        .addChoices(...CompoundLifts),
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
    const amountError = validateAmount(amount);
    if (amountError) {
      await interaction.reply({ content: amountError, flags: MessageFlags.Ephemeral });
      return;
    }
    const bodyweight = chatInteraction.options.getNumber('bodyweight', true);
    const bodyweightError = validateBodyweight(bodyweight);
    if (bodyweightError) {
      await interaction.reply({ content: bodyweightError, flags: MessageFlags.Ephemeral });
      return;
    }
    const additionaldetails = chatInteraction.options.getString('additionaldetails') || '';
    const liftCategory = LiftingCategories.Compound;

    // Insert the lift into MongoDB
    const db = mongoClient.db('StrengthBotDb');
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

    await interaction.reply(
      `Logged: ${exercise} - ${amount}lbs @ ${bodyweight}lbs bodyweight on ${date} ${additionaldetails ? `(${additionaldetails})` : ''}`,
    );
  },
};
