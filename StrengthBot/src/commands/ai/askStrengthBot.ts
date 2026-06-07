import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { getChatResponse } from '../../utils/aiUtils/chatProvider.js';

const FAILURE_MESSAGE = 'Sorry, StrengthBot could not process your question.';
const MAX_QUESTION_LENGTH = 500;
const DISCORD_MESSAGE_LIMIT = 2000;
const TRUNCATION_SUFFIX = '...';

function truncateForDiscord(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;

  return `${value.slice(0, maxLength - TRUNCATION_SUFFIX.length).trimEnd()}${TRUNCATION_SUFFIX}`;
}

function buildReplyContent(question: string, response?: string | null): string {
  const reply = response?.trim() || FAILURE_MESSAGE;
  const prefix = `**Your question:** ${question}\n**StrengthBot's reply:** `;
  const maxReplyLength = DISCORD_MESSAGE_LIMIT - prefix.length;

  return `${prefix}${truncateForDiscord(reply, maxReplyLength)}`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('askstrengthbot')
    .setDescription('Ask StrengthBot any fitness or strength question')
    .addStringOption((option) =>
      option.setName('question').setDescription('Your question for StrengthBot').setMaxLength(MAX_QUESTION_LENGTH).setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const question = interaction.options.getString('question', true);

    await interaction.deferReply();

    try {
      const response = await getChatResponse(question);
      await interaction.editReply({ content: buildReplyContent(question, response) });
    } catch {
      await interaction.editReply(FAILURE_MESSAGE);
    }
  },
};
