import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';
import { getChatResponse } from '../../utils/aiUtils/chatProvider.js';

export default {
  data: new SlashCommandBuilder()
    .setName('askstrengthbot')
    .setDescription('Ask StrengthBot any fitness or strength question')
    .addStringOption((option) => option.setName('question').setDescription('Your question for StrengthBot').setRequired(true)),
  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const question = chatInteraction.options.getString('question', true);
    await interaction.deferReply();
    try {
      const response = await getChatResponse(question);
      await interaction.editReply(response ?? '❌ Sorry, StrengthBot could not process your question.');
    } catch {
      await interaction.editReply('❌ Sorry, StrengthBot could not process your question.');
    }
  },
};
