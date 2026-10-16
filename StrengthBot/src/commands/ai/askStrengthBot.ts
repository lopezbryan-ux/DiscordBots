import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

const UNAVAILABLE_MESSAGE = "StrengthBot's AI chat is temporarily unavailable while we update the chat service. Thanks for your patience!";
const MAX_QUESTION_LENGTH = 500;

export default {
  data: new SlashCommandBuilder()
    .setName('askstrengthbot')
    .setDescription('Ask StrengthBot any fitness or strength question')
    .addStringOption((option) =>
      option.setName('question').setDescription('Your question for StrengthBot').setMaxLength(MAX_QUESTION_LENGTH).setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply({ content: UNAVAILABLE_MESSAGE });
  },
};
