import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';
import { mongoClient } from '../../index.js';

export default {
  data: new SlashCommandBuilder()
    .setName('logbodyweight')
    .setDescription('Log your body weight')
    .addNumberOption((option) => option.setName('bodyweight').setDescription('Your body weight (lbs)').setRequired(true))
    .addStringOption((option) => option.setName('additionaldetails').setDescription('Additional details (optional)').setRequired(false)),
  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const username = chatInteraction.user.username;
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const bodyweight = chatInteraction.options.getNumber('bodyweight', true);
    const additionaldetails = chatInteraction.options.getString('additionaldetails') || '';

    // Insert the bodyweight log into MongoDB
    const db = mongoClient.db('StrengthBotDb');
    const bodyWeightCollection = db.collection('StrengthBotBodyWeight');
    await bodyWeightCollection.insertOne({
      username,
      date,
      bodyweight,
      additionaldetails,
    });

    // Build a pretty embed
    const embed = {
      title: 'Body Weight Logged',
      color: 0x3498db,
      fields: [
        { name: 'User', value: username, inline: true },
        { name: 'Body Weight', value: `${bodyweight} lbs`, inline: true },
        { name: 'Date', value: date, inline: true },
      ],
    };
    if (additionaldetails) {
      embed.fields.push({ name: 'Details', value: additionaldetails, inline: false });
    }
    await interaction.reply({ embeds: [embed] });
  },
};
