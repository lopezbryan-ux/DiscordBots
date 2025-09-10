import { SlashCommandBuilder } from 'discord.js';

export const user = {
  data: new SlashCommandBuilder().setName('user').setDescription('Provides information about the user.'),
  async execute(interaction: any) {
    await interaction.reply(`Your username: ${interaction.user.username}`);
  },
};
