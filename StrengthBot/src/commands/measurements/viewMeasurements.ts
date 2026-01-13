import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';
import { mongoClient } from '../../index.js';

export default {
  data: new SlashCommandBuilder()
    .setName('viewmeasurements')
    .setDescription('View logged body measurements')
    .addUserOption((option) => option.setName('user').setDescription('User to view').setRequired(false)),

  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const targetUser = chatInteraction.options.getUser('user');
    const username = targetUser ? targetUser.username : chatInteraction.user.username;

    const db = mongoClient.db('StrengthBotDb');
    const measurementsCollection = db.collection('StrengthBotMeasurements');

    // Fetch all records for the user, newest first
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const records: any[] = await measurementsCollection.find({ username }).sort({ date: -1 }).toArray();

    if (!records || records.length === 0) {
      await interaction.reply({ content: `No measurements found for ${username}.`, ephemeral: true });
      return;
    }

    // Discord embeds allow up to 25 fields — show up to 25 newest entries and note if more exist
    const maxFields = 25;
    const shown = records.slice(0, maxFields);

    const fields = shown.map((r) => {
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

    const embed: any = {
      title: `Measurements — ${username}`,
      color: 0x3498db,
      fields,
    };

    if (records.length > maxFields) {
      embed.footer = { text: `Showing ${fields.length} of ${records.length} entries (newest first)` };
    }

    await interaction.reply({ embeds: [embed] });
  },
};
