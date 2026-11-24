import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from "discord.js";
import { randomUUID } from "node:crypto";
import { MongoServerError } from "mongodb";
import { getBookClubCollections, PollDocument, PollType } from "../book-club.js";
import { buildPollComponents, buildPollEmbed, refreshPollMessage } from "../polls.js";

const alreadyOpen = "There is already a book poll accepting nominations or votes. Its creator can use `/close-book-poll` before starting another one.";

export const data = new SlashCommandBuilder()
  .setName("start-book-poll")
  .setDescription("Open nominations; the first nomination starts 24 hours, then voting lasts 24 hours.")
  .addStringOption((option) =>
    option
      .setName("type")
      .setDescription("Choose one book or rank a top three. Defaults to one book.")
      .addChoices({ name: "Choose one book", value: "regular" }, { name: "Rank a top three", value: "ranked" }),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const pollType = (interaction.options.getString("type") ?? "regular") as PollType;
  const { polls } = getBookClubCollections();

  const activePoll = await polls.findOne({ guildId: interaction.guildId, status: { $in: ["nominating", "active"] } });
  if (activePoll) {
    await interaction.reply({
      content: alreadyOpen,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();
  // Save the deferred reply's ID with the round, before publishing its contents.
  // If publishing fails, the scheduler can still find and repair this message.
  const message = await interaction.fetchReply();
  const now = new Date();
  const poll: PollDocument = {
    pollId: randomUUID(),
    documentType: "poll",
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    messageId: message.id,
    status: "nominating",
    nominationsCloseAt: null,
    messageRefreshPending: true,
    pollType,
    options: [],
    votes: {},
    createdBy: interaction.user.id,
    createdByUsername: interaction.user.username,
    winner: null,
    createdAt: now,
    updatedAt: now,
    closesAt: null,
    closedAt: null,
  };

  try {
    await polls.insertOne(poll);
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      await interaction.editReply({ content: alreadyOpen });
      return;
    }
    throw error;
  }
  await interaction.editReply({
    embeds: [buildPollEmbed(poll)],
    components: buildPollComponents(poll),
  });

  // Include nominations submitted while the initial message was being posted.
  await refreshPollMessage(interaction.client, poll);
}
