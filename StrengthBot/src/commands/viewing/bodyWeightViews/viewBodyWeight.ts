import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';
import { mongoClient } from '../../../index.js';

export default {
  data: new SlashCommandBuilder().setName('viewbodyweight').setDescription('View your logged body weights'),
  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const username = chatInteraction.user.username;
    const db = mongoClient.db('StrengthBotDb');
    const bodyWeightCollection = db.collection('StrengthBotBodyWeight');
    const logs = await bodyWeightCollection.find({ username }).sort({ date: -1 }).toArray();
    if (!logs.length) {
      await interaction.reply('No body weight logs found.');
      return;
    }

    const embed = new EmbedBuilder().setTitle('Your Logged Body Weights').setColor(0x3498db).setDescription(`User: **${username}**`);

    logs.forEach((log) => {
      let value = `**Bodyweight:** ${log.bodyweight} lbs\n**Date:** ${log.date}`;
      if (log.additionaldetails) value += `\n**Details:** ${log.additionaldetails}`;
      embed.addFields({
        name: '\u200B',
        value,
        inline: false,
      });
    });

    await interaction.reply({ embeds: [embed] });
  },
};
