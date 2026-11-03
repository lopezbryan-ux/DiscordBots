import { ChatInputCommandInteraction, EmbedBuilder, escapeMarkdown, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { APIError } from 'openai';
import { getChatResponse } from '../../utils/aiUtils/chatProvider.js';

const MAX_QUESTION_LENGTH = 500;

export default {
  data: new SlashCommandBuilder()
    .setName('askstrengthbot')
    .setDescription('Ask StrengthBot any fitness or strength question')
    .addStringOption((option) =>
      option.setName('question').setDescription('Your question for StrengthBot').setMaxLength(MAX_QUESTION_LENGTH).setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const question = interaction.options.getString('question', true).trim();
    if (!question || question.length > MAX_QUESTION_LENGTH) {
      await interaction.reply({ content: 'Please enter a fitness question between 1 and 500 characters.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply();

    let content: string;
    try {
      const response = await getChatResponse(question);
      content = response.length > 2000 ? `${response.slice(0, 1997)}...` : response;
    } catch (error) {
      const status = error instanceof APIError ? error.status : undefined;
      // Log only the status, never request headers, credentials, or user questions.
      console.error('StrengthBot AI request failed:', status ? `Groq HTTP ${status}` : 'Chat service unavailable');
      content =
        status === 429
          ? "StrengthBot's AI has reached its free usage limit. Please try again later."
          : "StrengthBot's AI is unavailable right now. Please try again later.";
    }

    const embed = new EmbedBuilder()
      .setColor(0x4caf50)
      .setTitle('Ask StrengthBot')
      .setAuthor({ name: interaction.user.displayName, iconURL: interaction.user.displayAvatarURL() })
      .setDescription(`**Question**\n${escapeMarkdown(question)}\n\n**Answer**\n${content}`);

    await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
