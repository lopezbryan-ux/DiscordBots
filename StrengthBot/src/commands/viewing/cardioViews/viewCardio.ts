import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';
import { mongoClient } from '../../../index.js';

export default {
  data: new SlashCommandBuilder().setName('viewcardio').setDescription('View all your logged cardio activities'),
  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const username = chatInteraction.user.username;

    const db = mongoClient.db('StrengthBotDb');
    const cardioCollection = db.collection('StrengthBotCardioCollection');
    const logs = await cardioCollection.find({ username }).toArray();

    if (!logs.length) {
      await interaction.reply('No cardio logs found for you.');
      return;
    }

    // Format logs for display
    const formatted = logs
      .map((log) => {
        const type = log.cardioType === 'run' ? 'Run' : log.cardioType === 'bike' ? 'Bike' : log.cardioType;
        return `${type}: ${log.time} @ ${log.bodyweight}lbs on ${log.date}${log.additionaldetails ? ` (${log.additionaldetails})` : ''}`;
      })
      .join('\n');

    await interaction.reply(`Your Cardio Logs:\n${formatted}`);
  },
};
