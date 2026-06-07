import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { mongoClient } from '../../../index.js';
import { CARDIO_COLLECTION, CardioLog, DATABASE_NAME, MAX_EMBED_FIELDS } from '../../../utils/viewingUtils/viewHelpers.js';

const EMBED_COLOR = 0x1abc9c;

function formatCardioType(cardioType: string): string {
  if (cardioType === 'run') return 'Run';
  if (cardioType === 'bike') return 'Bike';
  return cardioType;
}

export default {
  data: new SlashCommandBuilder().setName('viewcardio').setDescription('View all your logged cardio activities'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const username = interaction.user.username;
    const cardioCollection = mongoClient.db(DATABASE_NAME).collection<CardioLog>(CARDIO_COLLECTION);
    const logs = await cardioCollection.find({ username }).sort({ date: -1 }).toArray();

    if (logs.length === 0) {
      await interaction.editReply('No cardio logs found for you.');
      return;
    }

    const shownLogs = logs.slice(0, MAX_EMBED_FIELDS);
    const embed = new EmbedBuilder().setTitle('Your Cardio Logs').setColor(EMBED_COLOR);

    shownLogs.forEach((log) => {
      const value = [
        `**Time:** ${log.time}`,
        `**Distance:** ${log.distance} miles`,
        `**Bodyweight:** ${log.bodyweight} lbs`,
        `**Date:** ${log.date}`,
      ];

      if (log.additionaldetails) {
        value.push(`**Details:** ${log.additionaldetails}`);
      }

      embed.addFields({
        name: `ID: ${log._id} | ${formatCardioType(log.cardioType)}`,
        value: value.join('\n'),
        inline: false,
      });
    });

    if (logs.length > MAX_EMBED_FIELDS) {
      embed.setFooter({ text: `Showing ${shownLogs.length} of ${logs.length} entries (newest first)` });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
