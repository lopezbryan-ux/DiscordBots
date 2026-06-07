import { ObjectId } from 'mongodb';
import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { mongoClient } from '../../index.js';

const DATABASE_NAME = 'StrengthBotDb';
const MEASUREMENTS_COLLECTION = 'StrengthBotMeasurements';
const EMBED_COLOR = 0x3498db;
const MAX_FIELDS = 25;
const DEFAULT_UNIT = 'in';

interface MeasurementRecord {
  _id: ObjectId;
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
    .setName('viewmeasurements')
    .setDescription('View logged body measurements')
    .addUserOption((option) => option.setName('user').setDescription('User to view').setRequired(false)),

  async execute(interaction: ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser('user');
    const username = targetUser ? targetUser.username : interaction.user.username;

    const measurementsCollection = mongoClient.db(DATABASE_NAME).collection<MeasurementRecord>(MEASUREMENTS_COLLECTION);
    const records = await measurementsCollection.find({ username }).sort({ date: -1 }).toArray();

    if (records.length === 0) {
      await interaction.reply({ content: `No measurements found for ${username}.`, flags: MessageFlags.Ephemeral });
      return;
    }

    const shown = records.slice(0, MAX_FIELDS);
    const fields = shown.map((record) => {
      const measurementLines = getMeasurementLines(record);
      const value = [`ID: ${record._id}`, measurementLines.join('\n') || 'No measurements'].join('\n');

      return { name: record.date, value, inline: false };
    });

    const embed = new EmbedBuilder().setTitle(`Measurements - ${username}`).setColor(EMBED_COLOR).addFields(fields);

    if (records.length > MAX_FIELDS) {
      embed.setFooter({ text: `Showing ${fields.length} of ${records.length} entries (newest first)` });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
