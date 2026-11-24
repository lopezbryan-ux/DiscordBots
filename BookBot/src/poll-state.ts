import { type Filter } from "mongodb";
import { type PollDocument } from "./book-club.js";

export const POLL_STAGE_DURATION_MS = 24 * 60 * 60 * 1000;

export function isNominationOpen(poll: PollDocument, now = new Date()) {
  if (poll.status === "nominating") {
    return poll.nominationsCloseAt == null || poll.nominationsCloseAt.getTime() > now.getTime();
  }
  // Polls started before the two-stage workflow keep their original behavior.
  return poll.nominationsCloseAt === undefined && isPollOpen(poll, now);
}

export function nominationPollFilter(poll: PollDocument): Filter<PollDocument> {
  if (poll.status !== "nominating") return openPollFilter(poll.pollId, poll.guildId);
  return {
    pollId: poll.pollId,
    guildId: poll.guildId,
    status: "nominating",
    $expr: {
      $or: [
        { $eq: [{ $ifNull: ["$nominationsCloseAt", null] }, null] },
        { $gt: ["$nominationsCloseAt", "$$NOW"] },
      ],
    },
  };
}

export function nominationClosedMessage(poll?: PollDocument | null) {
  return poll && (poll.status === "nominating" || poll.nominationsCloseAt !== undefined)
    ? "Nominations have closed for this poll. The book list is locked for voting."
    : "There is no open book poll right now. Start one with `/start-book-poll` before nominating books.";
}

export function isPollOpen(poll: Pick<PollDocument, "status" | "closesAt">, now = new Date()) {
  return poll.status === "active" && (
    poll.closesAt == null || (poll.closesAt instanceof Date && poll.closesAt.getTime() > now.getTime())
  );
}

export function openPollFilter(pollId: string, guildId: string | null): Filter<PollDocument> {
  return {
    pollId,
    guildId,
    status: "active",
    // Check the deadline at the database, rather than at an earlier application read.
    $expr: {
      $or: [
        { $eq: [{ $ifNull: ["$closesAt", null] }, null] },
        { $and: [{ $eq: [{ $type: "$closesAt" }, "date"] }, { $gt: ["$closesAt", "$$NOW"] }] },
      ],
    },
  };
}

export class PollClosedError extends Error {
  constructor(message = "Voting has ended for this poll.") {
    super(message);
  }
}
