import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';
import { mongoClient } from '../../index.js';
import { ObjectId } from 'mongodb';

export default {
  data: new SlashCommandBuilder()
    .setName('deletemeasurements')
    .setDescription('Remove a logged measurement entry by ID')
    .addStringOption((option) => option.setName('id').setDescription('The ID of the log to remove').setRequired(true)),

  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const username = chatInteraction.user.username;
    const id = chatInteraction.options.getString('id', true);
    const db = mongoClient.db('StrengthBotDb');
    const measurementsCollection = db.collection('StrengthBotMeasurements');
    let removedLog;
    try {
      removedLog = await measurementsCollection.findOne({ _id: new ObjectId(id), username });
      if (!removedLog) {
        await interaction.reply({ content: 'No measurement found with that ID, or you do not own this log.', flags: MessageFlags.Ephemeral });
        return;
      }
      await measurementsCollection.deleteOne({ _id: new ObjectId(id), username });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      await interaction.reply({ content: 'Invalid ID format.', flags: MessageFlags.Ephemeral });
      return;
    }

    let details = `Removed measurement (ID: ${id}):\n`;
    details += `User: ${removedLog.username}\n`;
    details += `Date: ${removedLog.date}\n`;
    if (removedLog.bicep != null) details += `Bicep: ${removedLog.bicep} in\n`;
    if (removedLog.forearm != null) details += `Forearm: ${removedLog.forearm} in\n`;
    if (removedLog.wrist != null) details += `Wrist: ${removedLog.wrist} in\n`;
    if (removedLog.chest != null) details += `Chest: ${removedLog.chest} in\n`;
    if (removedLog.quad != null) details += `Quad: ${removedLog.quad} in\n`;
    if (removedLog.notes) details += `Notes: ${removedLog.notes}\n`;

    await interaction.reply({ content: details });
  },
};
