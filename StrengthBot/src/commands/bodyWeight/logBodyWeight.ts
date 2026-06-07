import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { mongoClient } from '../../index.js';

const DATABASE_NAME = 'StrengthBotDb';
const BODY_WEIGHT_COLLECTION = 'StrengthBotBodyWeight';
const EMBED_COLOR = 0x3498db;
const MAX_DETAILS_LENGTH = 1000;

interface BodyWeightLog {
  username: string;
  date: string;
  bodyweight: number;
  additionaldetails: string;
}

export default {
  data: new SlashCommandBuilder()
    .setName('logbodyweight')
    .setDescription('Log your body weight')
    .addNumberOption((option) => option.setName('bodyweight').setDescription('Your body weight (lbs)').setMinValue(1).setRequired(true))
    .addStringOption((option) =>
      option.setName('additionaldetails').setDescription('Additional details (optional)').setMaxLength(MAX_DETAILS_LENGTH).setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const username = interaction.user.username;
    const date = new Date().toISOString().slice(0, 10);
    const bodyweight = interaction.options.getNumber('bodyweight', true);
    const additionaldetails = interaction.options.getString('additionaldetails')?.trim() || '';

    if (bodyweight <= 0) {
      await interaction.reply('Please enter a valid body weight.');
      return;
    }

    const bodyWeightCollection = mongoClient.db(DATABASE_NAME).collection<BodyWeightLog>(BODY_WEIGHT_COLLECTION);
    await bodyWeightCollection.insertOne({
      username,
      date,
      bodyweight,
      additionaldetails,
    });

    const embed = new EmbedBuilder()
      .setTitle('Body Weight Logged')
      .setColor(EMBED_COLOR)
      .addFields(
        { name: 'User', value: username, inline: true },
        { name: 'Body Weight', value: `${bodyweight} lbs`, inline: true },
        { name: 'Date', value: date, inline: true },
      );

    if (additionaldetails) {
      embed.addFields({ name: 'Details', value: additionaldetails, inline: false });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
