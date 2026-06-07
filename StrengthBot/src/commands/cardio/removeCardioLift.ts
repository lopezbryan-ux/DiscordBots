import { ObjectId } from 'mongodb';
import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { mongoClient } from '../../index.js';

const DATABASE_NAME = 'StrengthBotDb';
const CARDIO_COLLECTION = 'StrengthBotCardioCollection';
const OBJECT_ID_LENGTH = 24;

interface CardioLog {
  username: string;
  date: string;
  cardioType: string;
  time: string;
  distance: number;
  bodyweight: number;
  additionaldetails?: string;
}

export default {
  data: new SlashCommandBuilder()
    .setName('removecardio')
    .setDescription('Remove a logged cardio activity by ID')
    .addStringOption((option) =>
      option.setName('id').setDescription('ID of the log to remove').setMinLength(OBJECT_ID_LENGTH).setMaxLength(OBJECT_ID_LENGTH).setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const username = interaction.user.username;
    const id = interaction.options.getString('id', true);

    if (!ObjectId.isValid(id)) {
      await interaction.reply('Invalid ID format.');
      return;
    }

    const objectId = new ObjectId(id);
    const cardioCollection = mongoClient.db(DATABASE_NAME).collection<CardioLog>(CARDIO_COLLECTION);
    const removedLog = await cardioCollection.findOne({ _id: objectId, username });

    if (!removedLog) {
      await interaction.reply(`No cardio log found with ID ${id}.`);
      return;
    }

    await cardioCollection.deleteOne({ _id: objectId, username });

    const details = [
      `Type: ${removedLog.cardioType}`,
      `Time: ${removedLog.time}`,
      `Distance: ${removedLog.distance} miles`,
      `Bodyweight: ${removedLog.bodyweight} lbs`,
      `Date: ${removedLog.date}`,
    ];

    if (removedLog.additionaldetails) {
      details.push(`Details: ${removedLog.additionaldetails}`);
    }

    await interaction.reply(`Removed your cardio log with ID ${id}:\n${details.join('\n')}`);
  },
};
