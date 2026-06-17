import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder, SlashCommandSubcommandBuilder } from 'discord.js';
import { mongoClient } from '../../index.js';
import { ArmWrestlingLifts, CompoundLifts, IsolationLifts, LiftingCategories } from '../../utils/liftingUtils/liftChoices.js';
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

const LIFT_CATEGORY_BY_SUBCOMMAND: Record<string, string> = {
  armwrestling: LiftingCategories.ArmWrestling,
  compound: LiftingCategories.Compound,
  isolation: LiftingCategories.Isolation,
};

function buildLoggedMessage(exercise: string, amount: number, bodyweight: number, date: string, details: string): string {
  const detailsText = details ? ` (${details})` : '';

  return `Logged: ${exercise} - ${amount}lbs @ ${bodyweight}lbs bodyweight on ${date}${detailsText}`;
}

function addLiftOptions(subcommand: SlashCommandSubcommandBuilder, exerciseDescription: string, choices: { name: string; value: string }[]) {
  return subcommand
    .addStringOption((option) =>
      option
        .setName('exercise')
        .setDescription(exerciseDescription)
        .setRequired(true)
        .addChoices(...choices),
    )
    .addNumberOption((option) => option.setName('amount').setDescription('Amount lifted (lbs)').setMinValue(1).setRequired(true))
    .addNumberOption((option) => option.setName('bodyweight').setDescription('Your body weight (lbs)').setMinValue(1).setRequired(true))
    .addStringOption((option) =>
      option.setName('additionaldetails').setDescription('Additional details (optional)').setMaxLength(MAX_DETAILS_LENGTH).setRequired(false),
    );
}

export default {
  data: new SlashCommandBuilder()
    .setName('loglift')
    .setDescription('Log a lift')
    .addSubcommand((subcommand) =>
      addLiftOptions(subcommand.setName('armwrestling').setDescription('Log an armwrestling lift'), 'Armwrestling exercise', ArmWrestlingLifts),
    )
    .addSubcommand((subcommand) =>
      addLiftOptions(subcommand.setName('compound').setDescription('Log a compound lift'), 'Compound exercise', CompoundLifts),
    )
    .addSubcommand((subcommand) =>
      addLiftOptions(subcommand.setName('isolation').setDescription('Log an isolation lift'), 'Isolation exercise', IsolationLifts),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const username = interaction.user.username;
    const date = new Date().toISOString().slice(0, 10);
    const liftType = interaction.options.getSubcommand(true);
    const exercise = interaction.options.getString('exercise', true);
    const amount = interaction.options.getNumber('amount', true);
    const bodyweight = interaction.options.getNumber('bodyweight', true);
    const additionaldetails = interaction.options.getString('additionaldetails')?.trim() || '';
    const liftCategory = LIFT_CATEGORY_BY_SUBCOMMAND[liftType];

    if (!liftCategory) {
      await interaction.reply({ content: 'Unknown lift type.', flags: MessageFlags.Ephemeral });
      return;
    }

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
      liftCategory,
    });

    await interaction.reply(buildLoggedMessage(exercise, amount, bodyweight, date, additionaldetails));
  },
};
