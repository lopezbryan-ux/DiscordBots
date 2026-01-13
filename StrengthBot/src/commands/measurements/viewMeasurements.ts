import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';
import { mongoClient } from '../../index.js';

export default {
  data: new SlashCommandBuilder()
    .setName('viewmeasurements')
    .setDescription('View logged body measurements')
    .addUserOption((option) => option.setName('user').setDescription('User to view').setRequired(false))
    .addIntegerOption((option) =>
      option
        .setName('limit')
        .setDescription('Number of recent entries to show (max 25)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(25)
    ),

  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const targetUser = chatInteraction.options.getUser('user');
    const username = targetUser ? targetUser.username : chatInteraction.user.username;
    const limit = chatInteraction.options.getInteger('limit') ?? 5;

    const db = mongoClient.db('StrengthBotDb');
    const measurementsCollection = db.collection('StrengthBotMeasurements');

    const records: any[] = await measurementsCollection
      .find({ username })
      .sort({ date: -1 })
      .limit(limit)
      .toArray();

    if (!records || records.length === 0) {
      await interaction.reply({ content: `No measurements found for ${username}.`, ephemeral: true });
      return;
    }

    const fields = records.map((r) => {
      const parts: string[] = [];
      if (r.bicep != null) parts.push(`Bicep: ${r.bicep} in`);
      if (r.forearm != null) parts.push(`Forearm: ${r.forearm} in`);
      if (r.wrist != null) parts.push(`Wrist: ${r.wrist} in`);
      if (r.chest != null) parts.push(`Chest: ${r.chest} in`);
      if (r.quad != null) parts.push(`Quad: ${r.quad} in`);
      if (r.notes) parts.push(`Notes: ${r.notes}`);
      const idLine = `ID: ${r._id}`;
      const value = `${idLine}\n${parts.join('\n') || 'No measurements'}`;
      return { name: r.date, value, inline: false };
    });

    const embed = {
      title: `Measurements — ${username}`,
      color: 0x3498db,
      fields,
    };

    await interaction.reply({ embeds: [embed] });
  },
};
