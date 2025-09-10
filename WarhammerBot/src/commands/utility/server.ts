import { SlashCommandBuilder } from 'discord.js';

export const server = {
  data: new SlashCommandBuilder().setName('server').setDescription('Provides information about the server.'),
  async execute(interaction: any) {
    await interaction.reply(`Server name: ${interaction.guild?.name}\nTotal members: ${interaction.guild?.memberCount}`);
  },
};
