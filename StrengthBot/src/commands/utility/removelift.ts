import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';

import { MongoClient, ObjectId } from 'mongodb';

export default {
  data: new SlashCommandBuilder()
    .setName('removelift')
    .setDescription('Remove a logged lift by ID')
    .addStringOption((option) => option.setName('id').setDescription('The ID of the lift to remove (alphanumeric allowed)').setRequired(true)),
  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const username = chatInteraction.user.username;
    const id = chatInteraction.options.getString('id', true); // Accept alphanumeric lift ID (no validation)
    // MongoDB connection
    const uri =
      'mongodb+srv://***REMOVED***'; // Replace with your actual connection string
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('StrengthBotDb');
    const liftsCollection = db.collection('StrengthBotCollection');
    // Find the lift entry by _id and username
    const entryToRemove = await liftsCollection.findOne({ _id: new ObjectId(id), username });
    if (!entryToRemove) {
      await client.close();
      await interaction.reply({
        content: 'Invalid ID or you do not own this lift. Use /viewlifts to see your lift IDs.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await liftsCollection.deleteOne({ _id: new ObjectId(id), username });
    await client.close();
    // Format removed entry info
    const dateOnly = entryToRemove.date ? entryToRemove.date.split('T')[0] : '';
    let details = `Removed lift (ID: ${id}):\n`;
    details += `User: ${entryToRemove.username}\n`;
    details += `Exercise: ${entryToRemove.exercise}\n`;
    details += `Amount: ${entryToRemove.amount} lbs\n`;
    details += `Bodyweight: ${entryToRemove.bodyweight} lbs\n`;
    details += `Date: ${dateOnly}\n`;
    if (entryToRemove.additionaldetails) {
      details += `Details: ${entryToRemove.additionaldetails}\n`;
    }
    await interaction.reply({ content: details });
  },
};
