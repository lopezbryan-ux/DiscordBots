import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';
import { mongoClient } from '../../index.js';

export default {
  data: new SlashCommandBuilder()
    .setName('removecardio')
    .setDescription('Remove a logged mile run time')
    .addStringOption((option) => option.setName('date').setDescription('Date of the log to remove (YYYY-MM-DD)').setRequired(true)),
  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const username = chatInteraction.user.username;
    const date = chatInteraction.options.getString('date', true);

    const db = mongoClient.db('StrengthBotDb');
    const cardioCollection = db.collection('StrengthBotCardioCollection');

    const result = await cardioCollection.deleteOne({ username, date });

    if (result.deletedCount === 1) {
      await interaction.reply(`Removed your cardio log for ${date}.`);
    } else {
      await interaction.reply(`No cardio log found for ${date}.`);
    }
  },
};
