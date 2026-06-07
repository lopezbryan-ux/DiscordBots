import { ObjectId } from 'mongodb';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { mongoClient } from '../../index.js';

const DATABASE_NAME = 'StrengthBotDb';
const MEASUREMENTS_COLLECTION = 'StrengthBotMeasurements';
const OBJECT_ID_LENGTH = 24;
const DEFAULT_UNIT = 'in';

interface MeasurementRecord {
  username: string;
  date: string;
  unit?: string;
  notes?: string;
  bicep?: number;
  forearm?: number;
  wrist?: number;
  chest?: number;
  quad?: number;
}

function getMeasurementLines(record: MeasurementRecord): string[] {
  const unit = record.unit || DEFAULT_UNIT;
  const lines: string[] = [];

  if (record.bicep != null) lines.push(`Bicep: ${record.bicep} ${unit}`);
  if (record.forearm != null) lines.push(`Forearm: ${record.forearm} ${unit}`);
  if (record.wrist != null) lines.push(`Wrist: ${record.wrist} ${unit}`);
  if (record.chest != null) lines.push(`Chest: ${record.chest} ${unit}`);
  if (record.quad != null) lines.push(`Quad: ${record.quad} ${unit}`);
  if (record.notes) lines.push(`Notes: ${record.notes}`);

  return lines;
}

export default {
  data: new SlashCommandBuilder()
    .setName('deletemeasurements')
    .setDescription('Remove a logged measurement entry by ID')
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
    const measurementsCollection = mongoClient.db(DATABASE_NAME).collection<MeasurementRecord>(MEASUREMENTS_COLLECTION);
    const removedLog = await measurementsCollection.findOne({ _id: objectId, username });

    if (!removedLog) {
      await interaction.reply({
        content: 'No measurement found with that ID, or you do not own this log.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await measurementsCollection.deleteOne({ _id: objectId, username });

    const details = [`Removed measurement (ID: ${id}):`, `User: ${removedLog.username}`, `Date: ${removedLog.date}`];
    details.push(...getMeasurementLines(removedLog));

    await interaction.reply({ content: details.join('\n') });
  },
};
