import { ObjectId } from 'mongodb';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { mongoClient } from '../../index.js';

const DATABASE_NAME = 'StrengthBotDb';
const BODY_WEIGHT_COLLECTION = 'StrengthBotBodyWeight';
const OBJECT_ID_LENGTH = 24;

interface BodyWeightLog {
  username: string;
  date: string;
  bodyweight: number;
  additionaldetails?: string;
}

export default {
  data: new SlashCommandBuilder()
    .setName('removebodyweightlog')
    .setDescription('Remove a logged body weight entry by ID')
    .addStringOption((option) =>
      option
        .setName('id')
        .setDescription('The ID of the log to remove')
        .setMinLength(OBJECT_ID_LENGTH)
        .setMaxLength(OBJECT_ID_LENGTH)
        .setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const username = interaction.user.username;
    const id = interaction.options.getString('id', true);

    if (!ObjectId.isValid(id)) {
      await interaction.reply({ content: 'Invalid ID format.', flags: MessageFlags.Ephemeral });
      return;
    }

    const objectId = new ObjectId(id);
    const bodyWeightCollection = mongoClient.db(DATABASE_NAME).collection<BodyWeightLog>(BODY_WEIGHT_COLLECTION);
    const removedLog = await bodyWeightCollection.findOne({ _id: objectId, username });

    if (!removedLog) {
      await interaction.reply({
        content: 'No log found with that ID, or you do not own this log.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await bodyWeightCollection.deleteOne({ _id: objectId, username });

    const details = [
      `Removed log (ID: ${id}):`,
      `User: ${removedLog.username}`,
      `Bodyweight: ${removedLog.bodyweight} lbs`,
      `Date: ${removedLog.date}`,
    ];

    if (removedLog.additionaldetails) {
      details.push(`Details: ${removedLog.additionaldetails}`);
    }

    await interaction.reply({ content: details.join('\n') });
  },
};
