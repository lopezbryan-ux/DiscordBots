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

    // Format logs as embed fields
    const embedFields = logs.map((log) => {
      const type = log.cardioType === 'run' ? 'Run' : log.cardioType === 'bike' ? 'Bike' : log.cardioType;
      let value = `**Time:** ${log.time}\n**Distance:** ${log.distance} miles\n**Bodyweight:** ${log.bodyweight} lbs\n**Date:** ${log.date}`;
      if (log.additionaldetails) value += `\n**Details:** ${log.additionaldetails}`;
      return {
        name: `ID: ${log._id} | ${type}`,
        value,
        inline: false,
      };
    });

    await interaction.reply({
      embeds: [
        {
          title: 'Your Cardio Logs',
          color: 0x1abc9c,
          fields: embedFields,
        },
      ],
    });
  },
};
