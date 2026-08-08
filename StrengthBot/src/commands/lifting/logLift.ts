import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder, SlashCommandSubcommandBuilder } from 'discord.js';
import { mongoClient } from '../../index.js';
import { ArmWrestlingLifts, CompoundLifts, IsolationLifts, LiftingCategories } from '../../utils/liftingUtils/liftChoices.js';
import { validateAmount, validateBodyweight } from '../../utils/liftingUtils/validations.js';

const DATABASE_NAME = 'StrengthBotDb';
const LIFTS_COLLECTION = 'StrengthBotCollection';
const MAX_DETAILS_LENGTH = 1000;
const LOGGED_COLOR = 0x2ecc71;
const PR_COLOR = 0xf1c40f;

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

interface PersonalRecordInfo {
  isPersonalRecord: boolean;
  title: string;
  value: string;
}

function buildPersonalRecordInfo(amount: number, previousBest?: LiftLog | null): PersonalRecordInfo {
  if (!previousBest) {
    return {
      isPersonalRecord: true,
      title: 'Starting PR',
      value: `First entry for this exercise. Starting best: **${amount} lbs**`,
    };
  }

  if (amount <= previousBest.amount) {
    return {
      isPersonalRecord: false,
      title: 'Current PR',
      value: `Best remains **${previousBest.amount} lbs**`,
    };
  }

  const increase = amount - previousBest.amount;

  return {
    isPersonalRecord: true,
    title: 'New PR',
    value: `**${amount} lbs** is up **${increase} lbs** from your previous best of **${previousBest.amount} lbs**`,
  };
}

function buildLoggedLiftEmbed(log: LiftLog, prInfo: PersonalRecordInfo, logId: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(prInfo.isPersonalRecord ? `Lift Logged - ${prInfo.title}` : 'Lift Logged')
    .setColor(prInfo.isPersonalRecord ? PR_COLOR : LOGGED_COLOR)
    .setDescription(`**${log.exercise}** saved for **${log.username}**.`)
    .addFields(
      { name: 'Weight', value: `${log.amount} lbs`, inline: true },
      { name: 'Bodyweight', value: `${log.bodyweight} lbs`, inline: true },
      { name: 'Date', value: log.date, inline: true },
      { name: 'Category', value: log.liftCategory, inline: true },
      { name: prInfo.title, value: prInfo.value, inline: false },
      { name: 'Log ID', value: `\`${logId}\``, inline: false },
    );

  if (log.additionaldetails) {
    embed.addFields({ name: 'Notes', value: log.additionaldetails, inline: false });
  }

  return embed;
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
    const previousBest = await liftsCollection.findOne({ username, exercise, liftCategory }, { sort: { amount: -1 } });

    const liftLog = {
      username,
      date,
      exercise,
      amount,
      bodyweight,
      additionaldetails,
      liftCategory,
    };

    const result = await liftsCollection.insertOne(liftLog);
    const prInfo = buildPersonalRecordInfo(amount, previousBest);

    await interaction.reply({ embeds: [buildLoggedLiftEmbed(liftLog, prInfo, result.insertedId.toString())] });
  },
};
