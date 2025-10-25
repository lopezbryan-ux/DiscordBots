import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';
import { mongoClient } from '../../../index.js';

export default {
  data: new SlashCommandBuilder().setName('viewcardio').setDescription('View all your logged cardio activities'),
  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const username = chatInteraction.user.username;
    // Defer early since DB calls can take >3s and cause Unknown interaction errors
    try {
      await interaction.deferReply();
    } catch (err) {
      // If defer fails, continue — we'll attempt to reply later and handle errors
      console.warn('deferReply failed:', err);
    }

    const db = mongoClient.db('StrengthBotDb');
    const cardioCollection = db.collection('StrengthBotCardioCollection');
    const logs = await cardioCollection.find({ username }).toArray();

    if (!logs.length) {
      try {
        await interaction.editReply('No cardio logs found for you.');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('editReply failed, attempting followUp:', msg);
        try {
          await interaction.followUp('No cardio logs found for you.');
        } catch (e) {
          console.error('followUp also failed:', e);
        }
      }
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

    try {
      await interaction.editReply({
        embeds: [
          {
            title: 'Your Cardio Logs',
            color: 0x1abc9c,
            fields: embedFields,
          },
        ],
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('editReply failed, attempting followUp:', msg);
      try {
        await interaction.followUp({
          embeds: [
            {
              title: 'Your Cardio Logs',
              color: 0x1abc9c,
              fields: embedFields,
            },
          ],
        });
      } catch (e) {
        console.error('followUp also failed:', e);
      }
    }
  },
};
