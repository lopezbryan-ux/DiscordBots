import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';
import { mongoClient } from '../../index.js';
import { ObjectId } from 'mongodb';

export default {
  data: new SlashCommandBuilder()
    .setName('removebodyweightlog')
    .setDescription('Remove a logged body weight entry by ID')
    .addStringOption((option) => option.setName('id').setDescription('The ID of the log to remove').setRequired(true)),
  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const username = chatInteraction.user.username;
    const id = chatInteraction.options.getString('id', true);
    const db = mongoClient.db('StrengthBotDb');
    const bodyWeightCollection = db.collection('StrengthBotBodyWeight');
    let removedLog;
    try {
      removedLog = await bodyWeightCollection.findOne({ _id: new ObjectId(id), username });
      if (!removedLog) {
        await interaction.reply({ content: 'No log found with that ID, or you do not own this log.', flags: MessageFlags.Ephemeral });
        return;
      }
      await bodyWeightCollection.deleteOne({ _id: new ObjectId(id), username });
    } catch (err) {
      await interaction.reply({ content: 'Invalid ID format.', flags: MessageFlags.Ephemeral });
      return;
    }
    let details = `Removed log (ID: ${id}):\n`;
    details += `User: ${removedLog.username}\n`;
    details += `Bodyweight: ${removedLog.bodyweight} lbs\n`;
    details += `Date: ${removedLog.date}\n`;
    if (removedLog.additionaldetails) details += `Details: ${removedLog.additionaldetails}\n`;
    await interaction.reply({ content: details });
  },
};
