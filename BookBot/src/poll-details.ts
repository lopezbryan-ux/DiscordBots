import {
  ActionRowBuilder, ButtonBuilder, type ButtonInteraction, ButtonStyle, EmbedBuilder, MessageFlags,
} from "discord.js";
import { getBookClubCollections, getImageUrlOrNull, type PollDocument } from "./book-club.js";

const POLL_DETAILS_PREFIX = "book-poll:details";
const DETAILS_ACTIONS = ["open", "prev", "next", "refresh"] as const;

export function truncatePollText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  let end = Math.max(0, maxLength - 1);
  // Avoid splitting an emoji's UTF-16 surrogate pair.
  if (end > 0 && /[\uD800-\uDBFF]/.test(value[end - 1])) end -= 1;
  return `${value.slice(0, end)}…`;
}

export function buildPollDetailsCustomId(pollId: string, nominationId: string, action: typeof DETAILS_ACTIONS[number] = "open") {
  return `${POLL_DETAILS_PREFIX}:${pollId}:${nominationId}:${action}`;
}

export function isBookPollDetailsCustomId(customId: string) {
  return customId.startsWith(`${POLL_DETAILS_PREFIX}:`);
}

export function buildPollDetailsButton(pollId: string, nominationId: string) {
  return new ButtonBuilder()
    .setCustomId(buildPollDetailsCustomId(pollId, nominationId))
    .setLabel("Book details")
    .setEmoji("📖")
    .setStyle(ButtonStyle.Secondary);
}

export function buildPollDetailsView(poll: Pick<PollDocument, "pollId" | "options">, nominationId: string) {
  const index = poll.options.findIndex((option) => option.nominationId === nominationId);
  if (index < 0) return null;
  const option = poll.options[index];
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(truncatePollText(option.title, 256))
    .setDescription(`**Why this book?**\n${option.reason?.trim() || "No reason was provided."}`)
    .addFields(
      { name: "Author", value: truncatePollText(option.author || "Not provided", 1024), inline: true },
      { name: "Nominated by", value: `<@${option.nominatedBy}>`, inline: true },
    )
    .setFooter({ text: `Book ${index + 1} of ${poll.options.length}` });
  const cover = getImageUrlOrNull(option.imageUrl);
  if (cover) embed.setThumbnail(cover);

  const button = (target: number, label: string, action: typeof DETAILS_ACTIONS[number], disabled = false) => new ButtonBuilder()
    .setCustomId(buildPollDetailsCustomId(poll.pollId, poll.options[target].nominationId, action))
    .setLabel(label)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled);
  return {
    content: "",
    embeds: [embed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      button(Math.max(0, index - 1), "Previous book", "prev", index === 0),
      button(index, "Refresh", "refresh"),
      button(Math.min(poll.options.length - 1, index + 1), "Next book", "next", index === poll.options.length - 1),
    )],
    allowedMentions: { parse: [] as const },
  };
}

export async function handleBookPollDetails(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  const [, , pollId, nominationId, action] = parts;
  if (parts.length !== 5 || !isBookPollDetailsCustomId(interaction.customId) || !pollId || !nominationId || !DETAILS_ACTIONS.some((value) => value === action)) {
    await interaction.reply({ content: "That book details button is invalid.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.message.flags.has(MessageFlags.Ephemeral)) await interaction.deferUpdate();
  else await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Read the poll's saved options, including after nominations have been cleared
  // on closure. Stable IDs prevent a removed book from silently showing another.
  const { polls } = getBookClubCollections();
  const poll = await polls.findOne({ pollId, guildId: interaction.guildId });
  const view = poll && buildPollDetailsView(poll, nominationId);
  await interaction.editReply(view || {
    content: poll
      ? "That nomination was removed or replaced. Open Book details from the poll again to see the current books."
      : "That book poll is no longer available in this server.",
    embeds: [], components: [], allowedMentions: { parse: [] },
  });
}
