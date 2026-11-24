import { type Client } from "discord.js";
import { getBookClubCollections } from "./book-club.js";
import { closeOverdueBookPolls } from "./poll-closing.js";
import { POLL_STAGE_DURATION_MS } from "./poll-state.js";
import { refreshPollMessage } from "./polls.js";

export async function openDueBookPolls(client: Client, now = new Date()) {
  const { polls } = getBookClubCollections();
  const due = await polls.find({ status: "nominating", nominationsCloseAt: { $type: "date", $lte: now } }).toArray();
  let openedCount = 0;
  let emptyCount = 0;
  for (const candidate of due) {
    const empty = candidate.options.length === 0;
    // Comparing the options also protects against a nomination accepted while
    // this scan was in flight. A changed round is picked up on the next check.
    const poll = await polls.findOneAndUpdate({
      pollId: candidate.pollId,
      guildId: candidate.guildId,
      status: "nominating",
      nominationsCloseAt: { $type: "date", $lte: now },
      options: candidate.options,
    }, {
      $set: {
        status: empty ? "closed" : "active",
        // A restart after the nomination deadline still allows a full day to vote.
        closesAt: empty ? null : new Date(now.getTime() + POLL_STAGE_DURATION_MS),
        closedAt: empty ? now : null,
        pollType: candidate.pollType === "ranked" && candidate.options.length >= 3 ? "ranked" : "regular",
        updatedAt: now,
        phaseAnnouncementPending: true,
      },
    }, { returnDocument: "after" });
    if (!poll) continue;
    if (empty) emptyCount += 1;
    else openedCount += 1;
  }

  // Persist this work so a restart or a temporary Discord failure cannot leave
  // the nomination message permanently showing the wrong stage.
  const pending = await polls.find({ phaseAnnouncementPending: true }).toArray();
  for (const candidate of pending) {
    try {
      if (!await refreshPollMessage(client, candidate)) continue;
      // The creator may have cancelled while the Discord edit was in flight.
      const poll = await polls.findOne({
        pollId: candidate.pollId, guildId: candidate.guildId, phaseAnnouncementPending: true,
      });
      if (!poll) continue;
      const channel = await client.channels.fetch(poll.channelId);
      if (!channel?.isTextBased() || !("send" in channel)) continue;
      const link = `https://discord.com/channels/${poll.guildId}/${poll.channelId}/${poll.messageId}`;
      const content = poll.status === "active"
        ? `Nominations are closed! [Vote for our next book](${link}). Voting lasts 24 hours and closes <t:${Math.floor(poll.closesAt!.getTime() / 1000)}:f>.` +
          (poll.options.length < 3 ? " With fewer than three nominations, choose one book." : "")
        : "Book nominations closed with no books remaining, so no vote was opened. Use `/start-book-poll` to try again.";
      await channel.send({ content, allowedMentions: { parse: [] } });
      await polls.updateOne({ pollId: poll.pollId, guildId: poll.guildId, status: poll.status }, {
        $set: { phaseAnnouncementPending: false },
      });
    } catch (error) {
      console.error("Failed to announce a book poll stage; will retry:", error);
    }
  }
  return { openedCount, emptyCount };
}

// The startup pass and interval may overlap when Discord or MongoDB is slow.
let scheduledCheck: Promise<void> | undefined;
export function checkBookPollSchedule(client: Client) {
  if (scheduledCheck) return scheduledCheck;
  scheduledCheck = (async () => {
    await closeOverdueBookPolls(client);
    await openDueBookPolls(client);
    const { polls } = getBookClubCollections();
    const pendingMessages = await polls.find({ messageRefreshPending: true }).toArray();
    for (const poll of pendingMessages) {
      try {
        await refreshPollMessage(client, poll);
      } catch (error) {
        console.error("Failed to refresh a book poll message; will retry:", error);
      }
    }
  })().finally(() => { scheduledCheck = undefined; });
  return scheduledCheck;
}
