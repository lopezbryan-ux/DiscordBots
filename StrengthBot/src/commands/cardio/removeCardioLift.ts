import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';
import { mongoClient } from '../../index.js';
import { ObjectId } from 'mongodb';

export default {
  data: new SlashCommandBuilder()
    .setName('removecardio')
    .setDescription('Remove a logged cardio activity by ID')
    .addStringOption((option) => option.setName('id').setDescription('ID of the log to remove').setRequired(true)),
  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const username = chatInteraction.user.username;
    const id = chatInteraction.options.getString('id', true);

    const db = mongoClient.db('StrengthBotDb');
    const cardioCollection = db.collection('StrengthBotCardioCollection');
    let result;
    let removedLog;
    try {
      removedLog = await cardioCollection.findOne({ _id: new ObjectId(id), username });
      result = await cardioCollection.deleteOne({ _id: new ObjectId(id), username });
    } catch (err) {
      await interaction.reply('Invalid ID format.');
      return;
    }

    if (result.deletedCount === 1 && removedLog) {
      let details = `Type: ${removedLog.cardioType}\nTime: ${removedLog.time}\nDistance: ${removedLog.distance} miles\nBodyweight: ${removedLog.bodyweight} lbs\nDate: ${removedLog.date}`;
      if (removedLog.additionaldetails) details += `\nDetails: ${removedLog.additionaldetails}`;
      await interaction.reply(`Removed your cardio log with ID ${id}:
${details}`);
    } else {
      await interaction.reply(`No cardio log found with ID ${id}.`);
    }
  },
};
