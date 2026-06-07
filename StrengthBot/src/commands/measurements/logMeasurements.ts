import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { mongoClient } from '../../index.js';

const DATABASE_NAME = 'StrengthBotDb';
const MEASUREMENTS_COLLECTION = 'StrengthBotMeasurements';
const EMBED_COLOR = 0x2ecc71;
const UNIT = 'in';
const MAX_NOTES_LENGTH = 1000;

interface MeasurementRecord {
  username: string;
  date: string;
  unit: string;
  notes: string;
  bicep?: number;
  forearm?: number;
  wrist?: number;
  chest?: number;
  quad?: number;
}

function getMeasurementLines(record: MeasurementRecord): string[] {
  const lines: string[] = [];

  if (record.bicep != null) lines.push(`Bicep: ${record.bicep} ${record.unit}`);
  if (record.forearm != null) lines.push(`Forearm: ${record.forearm} ${record.unit}`);
  if (record.wrist != null) lines.push(`Wrist: ${record.wrist} ${record.unit}`);
  if (record.chest != null) lines.push(`Chest: ${record.chest} ${record.unit}`);
  if (record.quad != null) lines.push(`Quad: ${record.quad} ${record.unit}`);

  return lines;
}

export default {
  data: new SlashCommandBuilder()
    .setName('logmeasurements')
    .setDescription('Log body measurements (bicep, forearm, wrist, chest, quad)')
    .addNumberOption((option) => option.setName('bicep').setDescription('Bicep measurement').setMinValue(0.01).setRequired(false))
    .addNumberOption((option) => option.setName('forearm').setDescription('Forearm measurement').setMinValue(0.01).setRequired(false))
    .addNumberOption((option) => option.setName('wrist').setDescription('Wrist measurement').setMinValue(0.01).setRequired(false))
    .addNumberOption((option) => option.setName('chest').setDescription('Chest measurement').setMinValue(0.01).setRequired(false))
    .addNumberOption((option) => option.setName('quad').setDescription('Quad measurement').setMinValue(0.01).setRequired(false))
    .addStringOption((option) => option.setName('notes').setDescription('Additional notes').setMaxLength(MAX_NOTES_LENGTH).setRequired(false)),

  async execute(interaction: ChatInputCommandInteraction) {
    const username = interaction.user.username;
    const date = new Date().toISOString().slice(0, 10);
    const notes = interaction.options.getString('notes')?.trim() || '';

    const record: MeasurementRecord = {
      username,
      date,
      unit: UNIT,
      notes,
    };

    const bicep = interaction.options.getNumber('bicep');
    const forearm = interaction.options.getNumber('forearm');
    const wrist = interaction.options.getNumber('wrist');
    const chest = interaction.options.getNumber('chest');
    const quad = interaction.options.getNumber('quad');

    if (bicep != null) record.bicep = bicep;
    if (forearm != null) record.forearm = forearm;
    if (wrist != null) record.wrist = wrist;
    if (chest != null) record.chest = chest;
    if (quad != null) record.quad = quad;

    const measurementLines = getMeasurementLines(record);
    if (measurementLines.length === 0) {
      await interaction.reply({ content: 'Please provide at least one measurement to log.', flags: MessageFlags.Ephemeral });
      return;
    }

    const measurementsCollection = mongoClient.db(DATABASE_NAME).collection<MeasurementRecord>(MEASUREMENTS_COLLECTION);
    await measurementsCollection.insertOne(record);

    const embed = new EmbedBuilder()
      .setTitle('Measurements Logged')
      .setColor(EMBED_COLOR)
      .addFields(
        { name: 'User', value: username, inline: true },
        { name: 'Date', value: date, inline: true },
        { name: 'Measurements', value: measurementLines.join('\n'), inline: false },
      );

    if (notes) {
      embed.addFields({ name: 'Notes', value: notes, inline: false });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
