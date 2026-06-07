import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { mongoClient } from '../../../index.js';
import { BODY_WEIGHT_COLLECTION, BodyWeightLog, DATABASE_NAME, MAX_EMBED_FIELDS } from '../viewHelpers.js';

const EMBED_COLOR = 0x3498db;

export default {
  data: new SlashCommandBuilder().setName('viewbodyweight').setDescription('View your logged body weights'),

  async execute(interaction: ChatInputCommandInteraction) {
    const username = interaction.user.username;
    const bodyWeightCollection = mongoClient.db(DATABASE_NAME).collection<BodyWeightLog>(BODY_WEIGHT_COLLECTION);
    const logs = await bodyWeightCollection.find({ username }).sort({ date: -1 }).toArray();

    if (logs.length === 0) {
      await interaction.reply('No body weight logs found.');
      return;
    }

    const shownLogs = logs.slice(0, MAX_EMBED_FIELDS);
    const embed = new EmbedBuilder().setTitle('Your Logged Body Weights').setColor(EMBED_COLOR).setDescription(`User: **${username}**`);

    shownLogs.forEach((log) => {
      const value = [`**ID:** ${log._id}`, `**Bodyweight:** ${log.bodyweight} lbs`, `**Date:** ${log.date}`];

      if (log.additionaldetails) {
        value.push(`**Details:** ${log.additionaldetails}`);
      }

      embed.addFields({ name: '\u200B', value: value.join('\n'), inline: false });
    });

    if (logs.length > MAX_EMBED_FIELDS) {
      embed.setFooter({ text: `Showing ${shownLogs.length} of ${logs.length} entries (newest first)` });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
