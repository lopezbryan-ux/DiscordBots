import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';
import { mongoClient } from '../../index.js';

export default {
  data: new SlashCommandBuilder()
    .setName('logmeasurements')
    .setDescription('Log body measurements (bicep, forearm, wrist, chest, quad)')
    .addNumberOption((option) => option.setName('bicep').setDescription('Bicep measurement').setRequired(false))
    .addNumberOption((option) => option.setName('forearm').setDescription('Forearm measurement').setRequired(false))
    .addNumberOption((option) => option.setName('wrist').setDescription('Wrist measurement').setRequired(false))
    .addNumberOption((option) => option.setName('chest').setDescription('Chest measurement').setRequired(false))
    .addNumberOption((option) => option.setName('quad').setDescription('Quad measurement').setRequired(false))
    
    .addStringOption((option) => option.setName('notes').setDescription('Additional notes').setRequired(false)),
  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const username = chatInteraction.user.username;
    const date = new Date().toISOString().slice(0, 10);

    const bicep = chatInteraction.options.getNumber('bicep');
    const forearm = chatInteraction.options.getNumber('forearm');
    const wrist = chatInteraction.options.getNumber('wrist');
    const chest = chatInteraction.options.getNumber('chest');
    const quad = chatInteraction.options.getNumber('quad');
    const unit = 'in';
    const notes = chatInteraction.options.getString('notes') || '';

    if (bicep === null && forearm === null && wrist === null && chest === null && quad === null) {
      await interaction.reply({ content: 'Please provide at least one measurement to log.', ephemeral: true });
      return;
    }

    const db = mongoClient.db('StrengthBotDb');
    const measurementsCollection = db.collection('StrengthBotMeasurements');

    const record: any = {
      username,
      date,
      unit,
      notes,
    };
    if (bicep !== null) record.bicep = bicep;
    if (forearm !== null) record.forearm = forearm;
    if (wrist !== null) record.wrist = wrist;
    if (chest !== null) record.chest = chest;
    if (quad !== null) record.quad = quad;

    await measurementsCollection.insertOne(record);

    const measurementLines: string[] = [];
    if (bicep !== null) measurementLines.push(`Bicep: ${bicep} in`);
    if (forearm !== null) measurementLines.push(`Forearm: ${forearm} in`);
    if (wrist !== null) measurementLines.push(`Wrist: ${wrist} in`);
    if (chest !== null) measurementLines.push(`Chest: ${chest} in`);
    if (quad !== null) measurementLines.push(`Quad: ${quad} in`);

    const fields: { name: string; value: string; inline: boolean }[] = [
      { name: 'User', value: username, inline: true },
      { name: 'Date', value: date, inline: true },
      { name: 'Measurements', value: measurementLines.length ? measurementLines.join('\n') : 'No measurements', inline: false },
    ];
    if (notes) fields.push({ name: 'Notes', value: notes, inline: false });

    const embed = {
      title: 'Measurements Logged',
      color: 0x2ecc71,
      fields,
    };

    await interaction.reply({ embeds: [embed] });
  },
};
