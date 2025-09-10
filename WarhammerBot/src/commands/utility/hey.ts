import { SlashCommandBuilder } from 'discord.js';

export const ping = {
  data: new SlashCommandBuilder().setName('andy').setDescription('Replies with Pong!'),
  async execute(interaction: any) {
    await interaction.reply('dandy!');
  },
};
