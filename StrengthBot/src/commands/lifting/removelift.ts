import { ObjectId } from 'mongodb';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { mongoClient } from '../../index.js';

const DATABASE_NAME = 'StrengthBotDb';
const LIFTS_COLLECTION = 'StrengthBotCollection';
const OBJECT_ID_LENGTH = 24;

interface LiftLog {
  username: string;
  date?: string;
  exercise: string;
  amount: number;
  bodyweight: number;
  additionaldetails?: string;
}

export default {
  data: new SlashCommandBuilder()
    .setName('removelift')
    .setDescription('Remove a logged lift by ID')
    .addStringOption((option) =>
      option
        .setName('id')
        .setDescription('The ID of the lift to remove')
        .setMinLength(OBJECT_ID_LENGTH)
        .setMaxLength(OBJECT_ID_LENGTH)
        .setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const username = interaction.user.username;
    const id = interaction.options.getString('id', true);

    if (!ObjectId.isValid(id)) {
      await interaction.reply({
        content: 'Invalid ID format. Use /viewlifts to see your lift IDs.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const objectId = new ObjectId(id);
    const liftsCollection = mongoClient.db(DATABASE_NAME).collection<LiftLog>(LIFTS_COLLECTION);
    const entryToRemove = await liftsCollection.findOne({ _id: objectId, username });

    if (!entryToRemove) {
      await interaction.reply({
        content: 'Invalid ID or you do not own this lift. Use /viewlifts to see your lift IDs.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await liftsCollection.deleteOne({ _id: objectId, username });

    const dateOnly = entryToRemove.date ? entryToRemove.date.split('T')[0] : '';
    const details = [
      `Removed lift (ID: ${id}):`,
      `User: ${entryToRemove.username}`,
      `Exercise: ${entryToRemove.exercise}`,
      `Amount: ${entryToRemove.amount} lbs`,
      `Bodyweight: ${entryToRemove.bodyweight} lbs`,
      `Date: ${dateOnly}`,
    ];

    if (entryToRemove.additionaldetails) {
      details.push(`Details: ${entryToRemove.additionaldetails}`);
    }

    await interaction.reply({ content: details.join('\n') });
  },
};
