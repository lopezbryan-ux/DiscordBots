import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { mongoClient } from '../../index.js';
import { CompoundLifts, LiftingCategories } from '../../utils/liftingUtils/liftChoices.js';
import { validateAmount, validateBodyweight } from '../../utils/liftingUtils/validations.js';

const DATABASE_NAME = 'StrengthBotDb';
const LIFTS_COLLECTION = 'StrengthBotCollection';
const MAX_DETAILS_LENGTH = 1000;

interface LiftLog {
  username: string;
  date: string;
  exercise: string;
  amount: number;
  bodyweight: number;
  additionaldetails: string;
  liftCategory: string;
}

function buildLoggedMessage(exercise: string, amount: number, bodyweight: number, date: string, details: string): string {
  const detailsText = details ? ` (${details})` : '';

  return `Logged: ${exercise} - ${amount}lbs @ ${bodyweight}lbs bodyweight on ${date}${detailsText}`;
}

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
    .addNumberOption((option) => option.setName('amount').setDescription('Amount lifted (lbs)').setMinValue(1).setRequired(true))
    .addNumberOption((option) => option.setName('bodyweight').setDescription('Your body weight (lbs)').setMinValue(1).setRequired(true))
    .addStringOption((option) =>
      option.setName('additionaldetails').setDescription('Additional details (optional)').setMaxLength(MAX_DETAILS_LENGTH).setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const username = interaction.user.username;
    const date = new Date().toISOString().slice(0, 10);
    const exercise = interaction.options.getString('exercise', true);
    const amount = interaction.options.getNumber('amount', true);
    const bodyweight = interaction.options.getNumber('bodyweight', true);
    const additionaldetails = interaction.options.getString('additionaldetails')?.trim() || '';

    const amountError = validateAmount(amount);
    if (amountError) {
      await interaction.reply({ content: amountError, flags: MessageFlags.Ephemeral });
      return;
    }

    const bodyweightError = validateBodyweight(bodyweight);
    if (bodyweightError) {
      await interaction.reply({ content: bodyweightError, flags: MessageFlags.Ephemeral });
      return;
    }

    const liftsCollection = mongoClient.db(DATABASE_NAME).collection<LiftLog>(LIFTS_COLLECTION);
    await liftsCollection.insertOne({
      username,
      date,
      exercise,
      amount,
      bodyweight,
      additionaldetails,
      liftCategory: LiftingCategories.Compound,
    });

    await interaction.reply(buildLoggedMessage(exercise, amount, bodyweight, date, additionaldetails));
  },
};
