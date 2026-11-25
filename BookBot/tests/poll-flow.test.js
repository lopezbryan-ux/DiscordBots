import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { PollStore, pollFixture } from "./helpers/poll-store.js";

process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/book-bot-test";
const { mongoClient } = await import("../dist/mongo.js");
const {
  buildPollComponents, buildPollEmbed, buildPollCustomId, buildPollRankCustomId, buildPollRankOpenCustomId,
  buildPollPageCustomId, handleBookPollPage,
  getPollScores, handleBookPollVote, handleBookPollRank, handleBookPollRankOpen, refreshPollMessage,
} = await import("../dist/polls.js");
const { closeActiveBookPolls } = await import("../dist/poll-closing.js");
const nominate = await import("../dist/commands/nominate-book.js");
const remove = await import("../dist/commands/remove-nomination.js");
const start = await import("../dist/commands/start-book-poll.js");
const closeCommand = await import("../dist/commands/close-book-poll.js");
const { openDueBookPolls, checkBookPollSchedule } = await import("../dist/poll-scheduling.js");
const { POLL_STAGE_DURATION_MS } = await import("../dist/poll-state.js");
const { remapPollVotes } = await import("../dist/poll-votes.js");

let store;
let client;
let edits;
let announcements;
let beforeEdit;
const originalDb = mongoClient.db;
const originalWithSession = mongoClient.withSession;
const serialize = (message) => typeof message === "string" ? { content: message } : {
  ...message,
  embeds: message.embeds?.map((embed) => embed.toJSON()),
  components: message.components?.map((row) => row.toJSON()),
};

before(() => {
  mongoClient.db = () => ({ collection: (name) => store.collection(name) });
  mongoClient.withSession = (callback) => store.withSession(callback);
});
beforeEach(() => {
  store = new PollStore(pollFixture());
  edits = [];
  announcements = [];
  beforeEdit = null;
  const channel = {
    isTextBased: () => true,
    messages: {
      async fetch() {
        return {
          async edit(message) {
            assert.equal(store.transactions.getStore(), undefined, "Discord edits must follow commit");
            const serialized = serialize(message);
            if (beforeEdit) await beforeEdit(serialized);
            edits.push(serialized);
          },
        };
      },
    },
    async send(message) {
      assert.equal(store.transactions.getStore(), undefined, "Announcements must follow commit");
      announcements.push(serialize(message));
    },
  };
  client = { channels: { async fetch() { return channel; } } };
});
after(async () => {
  mongoClient.db = originalDb;
  mongoClient.withSession = originalWithSession;
  await mongoClient.close();
});

function interaction({ userId = "voter", customId, values = [], strings = {}, ephemeral = false, guildId = "flow-guild" } = {}) {
  return {
    client, guildId, channelId: "flow-channel", user: { id: userId, username: userId }, customId, values,
    options: { getString: (name) => strings[name] ?? null, getFocused: () => "" },
    message: { flags: { has: () => ephemeral } },
    async deferReply() { this.deferred = true; },
    async deferUpdate() { this.deferred = true; },
    async reply(message) { this.response = serialize(message); },
    async update(message) { this.response = serialize(message); },
    async editReply(message) { assert.equal(this.deferred, true); this.response = serialize(message); },
    async respond(choices) { this.choices = choices; },
    async fetchReply() { return { id: "flow-message" }; },
  };
}

function nominationRound({ overdue = false, pollType = "regular" } = {}) {
  poll().status = "nominating";
  poll().pollType = pollType;
  poll().closesAt = null;
  poll().nominationsCloseAt = new Date(Date.now() + (overdue ? -1 : POLL_STAGE_DURATION_MS));
  store.state.nominations.forEach((nomination) => { nomination.pollId = poll().pollId; });
}

test("start waits for the first nomination without a timer, voting controls, or an hours option", async () => {
  poll().status = "closed";
  const request = interaction({ strings: { type: "ranked" } });
  const before = Date.now();
  await start.execute(request);
  assert.equal(poll().status, "nominating");
  assert.equal(poll().pollType, "ranked");
  assert.deepEqual(poll().options, [], "Do not carry orphaned nominations into a new round");
  assert.deepEqual(poll().votes, {});
  assert.ok(poll().createdAt.getTime() >= before);
  assert.equal(poll().nominationsCloseAt, null);
  assert.equal(poll().closesAt, null);
  assert.equal(poll().messageId, "flow-message");
  assert.match(request.response.embeds[0].description, /24 hours/);
  assert.match(request.response.embeds[0].description, /first nomination/);
  assert.equal(request.response.embeds[0].fields[0].value, "Waiting for the first nomination");
  assert.deepEqual(request.response.components, []);
  assert.equal(start.data.toJSON().options.some((option) => option.name === "hours"), false);
});

async function startWaitingRound() {
  poll().status = "closed";
  store.state.nominations = [];
  await start.execute(interaction({ userId: "creator" }));
}

test("a waiting round survives scheduler checks and still accepts its first nomination days later", async () => {
  await startWaitingRound();
  poll().createdAt = new Date(Date.now() - 7 * POLL_STAGE_DURATION_MS);
  await checkBookPollSchedule(client);
  await openDueBookPolls(client, new Date(Date.now() + 7 * POLL_STAGE_DURATION_MS));
  assert.equal(poll().status, "nominating");
  assert.equal(poll().nominationsCloseAt, null);
  assert.equal(announcements.length, 0);

  const request = interaction({ userId: "first-member", strings: { title: "First book", author: "Author" } });
  await nominate.execute(request);
  assert.match(request.response.content, /24-hour nomination timer has started/);
  assert.equal(poll().options.length, 1);
  const nomination = store.state.nominations[0];
  assert.equal(nomination.pollId, poll().pollId);
  assert.equal(poll().nominationsCloseAt - nomination.createdAt, POLL_STAGE_DURATION_MS);
  assert.ok(nomination.createdAt > poll().createdAt);
  assert.equal(poll().closesAt, null);
  assert.match(edits.at(-1).embeds[0].fields[0].value, /<t:/);

  const deadline = new Date(poll().nominationsCloseAt);
  await openDueBookPolls(client, new Date(deadline.getTime() - 1));
  assert.equal(poll().status, "nominating");
  await openDueBookPolls(client, deadline);
  assert.equal(poll().status, "active");
  assert.equal(poll().closesAt - deadline, POLL_STAGE_DURATION_MS);
});

test("later nominations, edits, and removing all books never reset the first nomination's timer", async () => {
  await startWaitingRound();
  await nominate.execute(interaction({ userId: "first-member", strings: { title: "First book" } }));
  // Model time already elapsed so resetting the timer would change the deadline.
  poll().nominationsCloseAt = new Date(Date.now() + POLL_STAGE_DURATION_MS / 2);
  const deadline = new Date(poll().nominationsCloseAt);
  await nominate.execute(interaction({ userId: "second-member", strings: { title: "Second book" } }));
  assert.deepEqual(poll().nominationsCloseAt, deadline);
  await nominate.execute(interaction({ userId: "first-member", strings: { title: "Replacement" } }));
  assert.equal(poll().options.length, 2);
  assert.deepEqual(poll().nominationsCloseAt, deadline);
  for (const option of [...poll().options]) {
    await remove.execute(interaction({ userId: option.nominatedBy, strings: { nomination: option.nominationId } }));
    assert.deepEqual(poll().nominationsCloseAt, deadline);
  }
  assert.equal(poll().options.length, 0);
  await nominate.execute(interaction({ userId: "third-member", strings: { title: "Another book" } }));
  assert.deepEqual(poll().nominationsCloseAt, deadline);
});

test("invalid or failed first nominations leave the timer unset", async () => {
  await startWaitingRound();
  const before = structuredClone(store.state);
  const invalid = interaction({ strings: { title: " " } });
  await nominate.execute(invalid);
  assert.match(invalid.response.content, /Give me a book title/);
  assert.deepEqual(store.state, before);

  store.nextPollWrite = () => { throw new Error("simulated database failure"); };
  await assert.rejects(nominate.execute(interaction({ strings: { title: "First book" } })), /simulated database failure/);
  assert.deepEqual(store.state, before);
  assert.equal(poll().nominationsCloseAt, null);
});

test("concurrent first nominations keep the deadline of the first committed nomination", async () => {
  await startWaitingRound();
  let committedDeadline;
  store.nextPollWrite = () => store.transactions.exit(async () => {
    await nominate.execute(interaction({ userId: "second-member", strings: { title: "Second request" } }));
    committedDeadline = new Date(poll().nominationsCloseAt);
  });
  await nominate.execute(interaction({ userId: "first-member", strings: { title: "First request" } }));
  assert.ok(store.transactionAttempts >= 3, "The conflicting transaction must retry");
  assert.equal(poll().options.length, 2);
  assert.equal(store.state.nominations.length, 2);
  assert.deepEqual(poll().nominationsCloseAt, committedDeadline);
  const firstCommitted = store.state.nominations.find((nomination) => nomination.nominatedBy === "second-member");
  assert.equal(poll().nominationsCloseAt - firstCommitted.createdAt, POLL_STAGE_DURATION_MS);
});

test("the creator can cancel a round before anyone nominates", async () => {
  await startWaitingRound();
  const request = interaction({ userId: "creator" });
  await closeCommand.execute(request);
  assert.equal(poll().status, "closed");
  assert.equal(poll().nominationsCloseAt, null);
  assert.match(request.response.content, /Cancelled.*before voting opened/);
  assert.equal(edits.at(-1).embeds[0].title, "📕  Book Nominations Closed");
  assert.deepEqual(edits.at(-1).components, []);
  await checkBookPollSchedule(client);
  assert.equal(announcements.length, 0);
});

test("the first nomination's countdown is retried if its Discord refresh fails", async () => {
  await startWaitingRound();
  const fetch = client.channels.fetch;
  client.channels.fetch = async () => null;
  const request = interaction({ userId: "member", strings: { title: "First book" } });
  await nominate.execute(request);
  assert.match(request.response.content, /timer has started/);
  assert.equal(poll().messageRefreshPending, true);
  assert.equal(edits.at(-1).embeds[0].fields[0].value, "Waiting for the first nomination");

  client.channels.fetch = fetch;
  await checkBookPollSchedule(client);
  assert.equal(poll().messageRefreshPending, false);
  assert.match(edits.at(-1).embeds[0].fields[0].value, /<t:/);
  assert.match(edits.at(-1).embeds[0].description, /First book/);
});

test("removals and cancellation are retried if Discord is temporarily unavailable", async () => {
  await startWaitingRound();
  await nominate.execute(interaction({ userId: "member", strings: { title: "First book" } }));
  const fetch = client.channels.fetch;
  client.channels.fetch = async () => null;
  await remove.execute(interaction({ userId: "member", strings: { nomination: optionId(0) } }));
  assert.equal(poll().messageRefreshPending, true);
  client.channels.fetch = fetch;
  await checkBookPollSchedule(client);
  assert.equal(poll().messageRefreshPending, false);
  assert.equal(edits.at(-1).embeds[0].fields[2].value, "0");
  assert.doesNotMatch(edits.at(-1).embeds[0].description, /First book/);

  client.channels.fetch = async () => null;
  await closeCommand.execute(interaction({ userId: "creator" }));
  assert.equal(poll().messageRefreshPending, true);
  client.channels.fetch = fetch;
  await checkBookPollSchedule(client);
  assert.equal(poll().messageRefreshPending, false);
  assert.equal(edits.at(-1).embeds[0].title, "📕  Book Nominations Closed");
  assert.deepEqual(edits.at(-1).components, []);
});

test("a slow Discord edit cannot clear the retry flag for a newer nomination", async () => {
  await startWaitingRound();
  beforeEdit = () => {
    store.mutate((state) => {
      state.poll.options[0].title = "Newer book title";
      state.poll.messageRefreshPending = true;
    });
  };
  await nominate.execute(interaction({ userId: "member", strings: { title: "First book" } }));
  assert.equal(poll().messageRefreshPending, true);
  beforeEdit = null;
  await checkBookPollSchedule(client);
  assert.equal(poll().messageRefreshPending, false);
  assert.match(edits.at(-1).embeds[0].description, /Newer book title/);
});

test("the initial post catches a nomination submitted while its contents were being published", async () => {
  poll().status = "closed";
  store.state.nominations = [];
  const request = interaction({ userId: "creator" });
  const editReply = request.editReply.bind(request);
  request.editReply = async (message) => {
    await nominate.execute(interaction({ userId: "member", strings: { title: "Quick nomination" } }));
    return editReply(message);
  };
  await start.execute(request);
  assert.equal(poll().messageRefreshPending, false);
  assert.match(edits.at(-1).embeds[0].description, /Quick nomination/);
  assert.match(edits.at(-1).embeds[0].fields[0].value, /<t:/);
});

test("simultaneous starts handle the database uniqueness conflict without opening a second round", async () => {
  poll().status = "closed";
  const requests = [interaction({ userId: "member-one" }), interaction({ userId: "member-two" })];
  await Promise.all(requests.map(request => start.execute(request)));
  assert.equal(poll().createdBy, "member-one");
  assert.equal(poll().status, "nominating");
  assert.match(requests[1].response.content, /already a book poll/);
});

test("a failed initial publication retains the message ID and the scheduler repairs it", async () => {
  poll().status = "closed";
  const request = interaction();
  request.editReply = async () => { throw new Error("initial Discord edit failed"); };
  await assert.rejects(start.execute(request), /initial Discord edit failed/);
  assert.equal(poll().messageId, "flow-message");
  assert.equal(poll().messageRefreshPending, true);
  await checkBookPollSchedule(client);
  assert.equal(poll().messageRefreshPending, false);
  assert.match(edits.at(-1).embeds[0].title, /Nominate Our Next Book/);
});

test("failure obtaining the deferred message does not save an invisible round", async () => {
  poll().status = "closed";
  const request = interaction();
  request.fetchReply = async () => { throw new Error("reply unavailable"); };
  await assert.rejects(start.execute(request), /reply unavailable/);
  assert.equal(poll().status, "closed");
  await start.execute(interaction());
  assert.equal(poll().status, "nominating");
});

for (const status of ["active", "nominating"]) {
  test(`start refuses a second round while the first is ${status}`, async () => {
    poll().status = status;
    const before = structuredClone(store.state);
    const request = interaction();
    await start.execute(request);
    assert.match(request.response.content, /already a book poll/);
    assert.deepEqual(store.state, before);
  });
}

test("members can nominate, replace, and remove only their book during nominations", async () => {
  nominationRound();
  const oldId = optionId(0);
  const request = interaction({ userId: "nominator-0", strings: { title: "Replacement", author: "Author" } });
  await nominate.execute(request);
  assert.match(request.response.content, /upcoming vote/);
  assert.equal(poll().options.length, 3);
  assert.notEqual(optionId(0), oldId);
  assert.equal(poll().options[0].title, "Replacement");
  const autocomplete = interaction({ userId: "nominator-0" });
  await remove.autocomplete(autocomplete);
  assert.deepEqual(autocomplete.choices.map((choice) => choice.value), [optionId(0)]);
  await remove.execute(interaction({ userId: "nominator-0", strings: { nomination: optionId(0) } }));
  assert.equal(poll().options.length, 2);
  assert.equal(store.state.nominations.length, 2);
});

for (const pollType of ["regular", "ranked"]) {
  test(`${pollType}: nominations have no ballot controls and reject early votes`, async () => {
    nominationRound({ pollType });
    assert.deepEqual(buildPollComponents(poll()).flatMap(row => row.toJSON().components).map(control => control.label), ["Book details"]);
    assert.match(buildPollEmbed(poll()).toJSON().title, /Nominate/);
    const response = await vote(optionId(0), pollType === "ranked" ? 0 : undefined);
    assert.match(response.content, /Voting has not opened/);
    const request = interaction({ customId: buildPollRankOpenCustomId(poll().pollId, 0) });
    await handleBookPollRankOpen(request);
    assert.match(request.response.content, /Voting has not opened/);
    assert.deepEqual(poll().votes, {});
  });
}

test("a large nomination list can be paged without exposing voting controls", async () => {
  nominationRound();
  poll().options = Array.from({ length: 25 }, (_, index) => ({ ...poll().options[0], title: `Book ${index}` }));
  const components = buildPollComponents(poll()).flatMap((row) => row.toJSON().components);
  assert.equal(components.length, 4);
  assert.ok(components.every((component) => component.custom_id.startsWith("book-poll:page:") || component.custom_id.startsWith("book-poll:details:")));
  await handleBookPollPage(interaction({ customId: buildPollPageCustomId(poll().pollId, 1) }));
  assert.match(edits.at(-1).embeds[0].description, /Book 24/);
});

test("startup refresh exposes existing saved reasons and covers without changing a round or its deadline", async () => {
  nominationRound();
  poll().options[0].reason = "An existing reason worth sharing";
  poll().options[0].imageUrl = "https://example.com/saved-cover.jpg";
  const before = structuredClone(poll());
  const fetch = client.channels.fetch;
  client.channels.fetch = async () => null;
  await checkBookPollSchedule(client, { refreshOpenMessages: true });
  assert.equal(poll().messageRefreshPending, true, "Failed startup edits must survive for a retry");
  client.channels.fetch = fetch;
  await checkBookPollSchedule(client);
  assert.match(edits.at(-1).embeds[0].description, /An existing reason worth sharing/);
  assert.match(edits.at(-1).embeds[0].description, /saved-cover.jpg/);
  assert.ok(controls(edits.at(-1)).some(control => control.label === "Book details"));
  assert.deepEqual(poll(), { ...before, messageRefreshPending: false });
});

test("editing a nomination updates its reason and cover in the poll while preserving the timer", async () => {
  nominationRound();
  const deadline = new Date(poll().nominationsCloseAt);
  const request = interaction({ userId: "nominator-0", strings: {
    title: "Book A", author: "Author 1", reason: "A new reason to read it", "image-url": "https://example.com/new-cover.jpg",
  } });
  await nominate.execute(request);
  assert.match(edits.at(-1).embeds[0].description, /A new reason to read it/);
  assert.match(edits.at(-1).embeds[0].description, /new-cover.jpg/);
  assert.equal(poll().options[0].reason, "A new reason to read it");
  assert.equal(poll().options[0].imageUrl, "https://example.com/new-cover.jpg");
  assert.deepEqual(poll().nominationsCloseAt, deadline);
});

for (const action of ["nominate", "remove"]) {
  test(`${action}: nominations lock at their exact deadline before the scheduler runs`, async () => {
    nominationRound();
    poll().nominationsCloseAt = new Date();
    const before = structuredClone(store.state);
    const request = interaction({ userId: "nominator-0", strings: { title: "Too late", nomination: optionId(0) } });
    await (action === "nominate" ? nominate : remove).execute(request);
    assert.match(request.response.content, /Nominations have closed/);
    assert.deepEqual(store.state, before);
  });

  test(`${action}: a nomination deadline reached during saving rolls back all edits`, async () => {
    nominationRound();
    const before = structuredClone(store.state);
    store.nextPollWrite = () => { store.serverNow = new Date(poll().nominationsCloseAt); };
    const request = interaction({ userId: "nominator-0", strings: { title: "Too late", nomination: optionId(0) } });
    await (action === "nominate" ? nominate : remove).execute(request);
    assert.match(request.response.content, /Nominations have closed/);
    assert.deepEqual(store.state, before);
  });

  test(`${action}: voting locks the new poll's nominations`, async () => {
    nominationRound();
    poll().status = "active";
    poll().closesAt = new Date(Date.now() + POLL_STAGE_DURATION_MS);
    const before = structuredClone(store.state);
    const request = interaction({ userId: "nominator-0", strings: { title: "Too late", nomination: optionId(0) } });
    await (action === "nominate" ? nominate : remove).execute(request);
    assert.match(request.response.content, /Nominations have closed/);
    await remove.autocomplete(request);
    assert.deepEqual(request.choices, []);
    assert.deepEqual(store.state, before);
  });
}

test("the scheduler waits for the deadline then opens exactly 24 hours of voting", async () => {
  nominationRound({ pollType: "ranked" });
  const deadline = new Date(poll().nominationsCloseAt);
  const options = structuredClone(poll().options);
  await openDueBookPolls(client, new Date(deadline.getTime() - 1));
  assert.equal(poll().status, "nominating");
  assert.equal(announcements.length, 0);
  const result = await openDueBookPolls(client, deadline);
  assert.equal(result.openedCount, 1);
  assert.equal(poll().status, "active");
  assert.equal(poll().pollType, "ranked");
  assert.equal(poll().closesAt - deadline, POLL_STAGE_DURATION_MS);
  assert.deepEqual(poll().options, options);
  assert.equal(announcements.length, 1);
  assert.match(announcements[0].content, /Nominations are closed/);
  assert.match(edits.at(-1).embeds[0].title, /Vote for Our Next Book/);
  assert.ok(controls(edits.at(-1)).some((control) => !control.disabled));
  await openDueBookPolls(client, new Date(deadline.getTime() + 60_000));
  assert.equal(announcements.length, 1);
  assert.equal(poll().closesAt - deadline, POLL_STAGE_DURATION_MS);
  await vote(optionId(0), 0);
  assert.deepEqual(poll().votes.voter, { first: 0 });
});

test("startup catches missed nomination deadlines and still gives a full voting day", async () => {
  nominationRound({ overdue: true });
  poll().nominationsCloseAt = new Date(Date.now() - 3 * POLL_STAGE_DURATION_MS);
  await Promise.all([checkBookPollSchedule(client), checkBookPollSchedule(client)]);
  assert.equal(poll().status, "active");
  assert.equal(poll().closesAt - poll().updatedAt, POLL_STAGE_DURATION_MS);
  assert.equal(announcements.length, 1);
  await vote(optionId(0));
  poll().closesAt = new Date(Date.now() - 1);
  await checkBookPollSchedule(client);
  assert.equal(poll().status, "closed");
  assert.equal(poll().winner.title, "Book A");
  assert.equal(store.state.books.length, 1);
});

for (const count of [0, 1, 2]) {
  test(`a ranked round with ${count} nominations closes without voting or adding a book`, async () => {
    nominationRound({ overdue: true, pollType: "ranked" });
    poll().options = poll().options.slice(0, count);
    store.state.nominations = store.state.nominations.slice(0, count);
    const result = await openDueBookPolls(client);
    assert.equal(poll().status, "closed");
    assert.equal(result.closedCount, 1);
    assert.equal(result.openedCount, 0);
    assert.equal(poll().pollType, "ranked");
    assert.equal(poll().closesAt, null);
    assert.equal(store.state.nominations.length, 0);
    assert.equal(store.state.books.length, 0);
    assert.equal(announcements.length, 1);
    assert.match(announcements[0].content, /fewer than three nominations/);
    assert.deepEqual(buildPollComponents(poll()), []);
    assert.match(edits.at(-1).embeds[0].description, /fewer than three nominations/);
    await start.execute(interaction());
    assert.equal(poll().status, "nominating");
    assert.deepEqual(poll().options, []);
  });
}

test("a failed nomination cleanup rolls back automatic closure of a short ranked round", async () => {
  nominationRound({ overdue: true, pollType: "ranked" });
  poll().options = poll().options.slice(0, 2);
  store.state.nominations = store.state.nominations.slice(0, 2);
  const before = structuredClone(store.state);
  store.nextNominationDelete = () => { throw new Error("cleanup failed"); };
  await assert.rejects(openDueBookPolls(client), /cleanup failed/);
  assert.deepEqual(store.state, before);
  assert.equal(announcements.length, 0);
});

test("an empty regular round closes without voting", async () => {
  nominationRound({ overdue: true });
  poll().options = [];
  store.state.nominations = [];
  await openDueBookPolls(client);
  assert.equal(poll().status, "closed");
  assert.match(announcements[0].content, /no books remaining/);
});

test("the creator can cancel a nomination round and it never opens voting", async () => {
  nominationRound({ overdue: true });
  const forbidden = interaction();
  await closeCommand.execute(forbidden);
  assert.match(forbidden.response.content, /Only the person/);
  await closeCommand.execute(interaction({ userId: "creator" }));
  assert.equal(poll().status, "closed");
  assert.equal(store.state.nominations.length, 0);
  assert.equal(store.state.books.length, 0);
  await openDueBookPolls(client);
  assert.equal(announcements.length, 0);
});

test("a transition retries publishing after Discord is temporarily unavailable", async () => {
  nominationRound({ overdue: true });
  const fetch = client.channels.fetch;
  client.channels.fetch = async () => null;
  await openDueBookPolls(client);
  assert.equal(poll().status, "active");
  assert.equal(poll().phaseAnnouncementPending, true);
  const deadline = new Date(poll().closesAt);
  client.channels.fetch = fetch;
  await openDueBookPolls(client);
  assert.equal(announcements.length, 1);
  assert.equal(poll().phaseAnnouncementPending, false);
  assert.deepEqual(poll().closesAt, deadline);
});

test("a nomination racing with transition is preserved before voting opens", async () => {
  nominationRound({ overdue: true });
  store.nextPollWrite = () => store.mutate((state) => { state.poll.options[0].title = "Last accepted nomination"; });
  await openDueBookPolls(client);
  assert.equal(poll().status, "nominating");
  await openDueBookPolls(client);
  assert.equal(poll().status, "active");
  assert.equal(poll().options[0].title, "Last accepted nomination");
});

test("a cancelled round does not announce voting after a delayed Discord edit", async () => {
  nominationRound({ overdue: true });
  beforeEdit = () => {
    store.mutate((state) => {
      state.poll.status = "closed";
      state.poll.phaseAnnouncementPending = false;
    });
  };
  await openDueBookPolls(client);
  assert.equal(announcements.length, 0);
});

test("an expired vote is closed before a pending opening announcement is retried", async () => {
  nominationRound();
  poll().status = "active";
  poll().closesAt = new Date(Date.now() - 1);
  poll().phaseAnnouncementPending = true;
  await checkBookPollSchedule(client);
  assert.equal(poll().status, "closed");
  assert.equal(poll().phaseAnnouncementPending, false);
  assert.equal(announcements.length, 0);
});

const poll = () => store.state.poll;
const optionId = (index) => poll().options[index].nominationId;
const controls = (message) => message.components.flatMap((row) => row.components);
const close = () => closeActiveBookPolls({ client, guildId: poll().guildId, addWinners: true });

async function vote(nominationId, rankIndex, userId = "voter") {
  const request = interaction({
    userId,
    customId: rankIndex === undefined ? buildPollCustomId(poll().pollId, nominationId, 0) : buildPollRankCustomId(poll().pollId, rankIndex, 0),
    values: rankIndex === undefined ? [] : [nominationId],
    ephemeral: rankIndex !== undefined,
  });
  await (rankIndex === undefined ? handleBookPollVote : handleBookPollRank)(request);
  return request.response;
}

test("regular buttons and ranked menu values identify nominations by stable IDs", () => {
  const regular = buildPollComponents(poll()).map((row) => row.toJSON());
  regular[0].components.forEach((button, index) => {
    assert.ok(button.custom_id.includes(optionId(index)));
    assert.ok(button.custom_id.length <= 100);
  });
  poll().pollType = "ranked";
  const ranked = buildPollComponents(poll(), false, 0, "voter").map((row) => row.toJSON());
  for (const row of ranked.filter(row => row.components[0].type === 3)) assert.deepEqual(row.components[0].options.map((option) => option.value), poll().options.map((option) => option.nominationId));
});

test("later pages keep stable IDs and Discord's component length limits", async () => {
  const template = poll().options[0];
  poll().options = Array.from({ length: 25 }, (_, index) => ({
    ...template,
    nominationId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    title: `Book ${index + 1}`,
  }));
  const rows = buildPollComponents(poll(), false, 1).map((row) => row.toJSON());
  assert.equal(rows[0].components[4].custom_id, buildPollCustomId(poll().pollId, optionId(24), 1));
  rows.flatMap((row) => row.components).forEach((component) => assert.ok(component.custom_id.length <= 100));
  await vote(optionId(24));
  assert.equal(poll().votes.voter, 24);
  poll().pollType = "ranked";
  const ranked = buildPollComponents(poll(), false, 1, "voter").map((row) => row.toJSON());
  assert.equal(ranked[0].components[0].options[4].value, optionId(24));
});

for (const pollType of ["regular", "ranked"]) {
  const rank = pollType === "ranked" ? 0 : undefined;

  test(`${pollType}: old positional controls are rejected and refreshed`, async () => {
    poll().pollType = pollType;
    const response = await vote("1", rank);
    assert.match(response.content, /out of date/);
    assert.deepEqual(poll().votes, {});
    assert.equal(store.voteWrites, 0);
    assert.ok(edits.length > 0);
    if (pollType === "ranked") assert.equal(controls(response)[0].options[0].value, optionId(0));
  });

  test(`${pollType}: a stale control still selects the same book after another nomination is removed`, async () => {
    poll().pollType = pollType;
    const bookB = optionId(1);
    await remove.execute(interaction({ userId: "nominator-0", strings: { nomination: optionId(0) } }));
    const response = await vote(bookB, rank);
    assert.match(response.content, /Book B/);
    assert.deepEqual(poll().votes.voter, rank === undefined ? 0 : { first: 0 });
  });

  test(`${pollType}: a removed book's control cannot silently select its replacement position`, async () => {
    poll().pollType = pollType;
    const removedId = optionId(0);
    await remove.execute(interaction({ userId: "nominator-0", strings: { nomination: removedId } }));
    const response = await vote(removedId, rank);
    assert.match(response.content, /no longer available/);
    assert.deepEqual(poll().votes, {});
  });

  test(`${pollType}: expired polls reject votes while their stored status is still active`, async () => {
    poll().pollType = pollType;
    poll().closesAt = new Date(Date.now() - 1);
    const response = await vote(optionId(0), rank);
    assert.match(response.content, /Voting has ended/);
    assert.equal(poll().status, "active");
    assert.equal(store.voteWrites, 0);
    assert.deepEqual(poll().votes, {});
  });

  test(`${pollType}: the database deadline prevents a vote when time expires during saving`, async () => {
    poll().pollType = pollType;
    store.nextPollWrite = () => { store.serverNow = new Date(poll().closesAt.getTime() + 1); };
    const response = await vote(optionId(0), rank);
    assert.doesNotMatch(response.content, /is counted|is complete/);
    assert.equal(store.voteWrites, 0);
    assert.deepEqual(poll().votes, {});
  });

  test(`${pollType}: closing between the read and write prevents the vote from being saved`, async () => {
    poll().pollType = pollType;
    store.nextPollWrite = () => store.mutate((state) => { state.poll.status = "closed"; });
    const response = await vote(optionId(0), rank);
    assert.match(response.content, /Voting has ended/);
    assert.deepEqual(poll().votes, {});
    assert.ok(controls(edits.at(-1)).filter((component) => component.label !== "Book details").every((component) => component.disabled));
  });
}

test("a nomination shift during a vote save retries using its ID and current position", async () => {
  const bookB = optionId(1);
  store.nextPollWrite = () => store.mutate((state) => {
    state.poll.options.shift();
    state.poll.votes = remapPollVotes(state.poll.votes, new Map([[1, 0], [2, 1]]));
  });
  await vote(bookB);
  assert.equal(poll().votes.voter, 0);
  assert.equal(poll().options[poll().votes.voter].title, "Book B");
});

test("simultaneous ranked choices preserve all three ranks for the same member", async () => {
  poll().pollType = "ranked";
  await Promise.all([0, 1, 2].map((rank) => vote(optionId(rank), rank)));
  assert.deepEqual(poll().votes.voter, { first: 0, second: 1, third: 2 });
  assert.deepEqual(getPollScores(poll()), [3, 2, 1]);
});

test("simultaneous regular votes preserve both members, and a revote replaces only its own vote", async () => {
  await Promise.all([vote(optionId(0), undefined, "voter-a"), vote(optionId(1), undefined, "voter-b")]);
  assert.deepEqual(getPollScores(poll()), [1, 1, 0]);
  await vote(optionId(2), undefined, "voter-a");
  assert.deepEqual(poll().votes, { "voter-a": 2, "voter-b": 1 });
  assert.deepEqual(getPollScores(poll()), [0, 1, 1]);
});

test("partial and duplicate ranked ballots explicitly warn they do not count until corrected", async () => {
  poll().pollType = "ranked";
  assert.match((await vote(optionId(0), 0)).content, /does not count yet/);
  await vote(optionId(0), 1);
  assert.match((await vote(optionId(2), 2)).content, /Pick three different books/);
  assert.deepEqual(getPollScores(poll()), [0, 0, 0]);
  assert.match((await vote(optionId(1), 1)).content, /ballot is complete/);
  assert.deepEqual(getPollScores(poll()), [3, 2, 1]);
});

test("expired polls cannot open another private ranked ballot", async () => {
  poll().pollType = "ranked";
  poll().closesAt = new Date(Date.now() - 1);
  const request = interaction({ customId: buildPollRankOpenCustomId(poll().pollId, 0) });
  await handleBookPollRankOpen(request);
  assert.match(request.response.content, /Voting has ended/);
});

test("removing a nomination retries with a concurrent accepted vote instead of losing it", async () => {
  store.nextPollWrite = () => store.mutate((state) => { state.poll.votes.lateVoter = 2; });
  await remove.execute(interaction({ userId: "nominator-0", strings: { nomination: optionId(0) } }));
  assert.ok(store.transactionAttempts >= 2);
  assert.equal(poll().options[poll().votes.lateVoter].title, "Book C");
  assert.deepEqual(poll().votes, { lateVoter: 1 });
  assert.equal(store.state.nominations.length, 2);
});

test("replacing a nominated book clears its old votes and invalidates its old controls", async () => {
  const oldId = optionId(0);
  poll().votes = { oldBook: 0, otherBook: 1, ranked: { first: 0, second: 1, third: 2 } };
  const request = interaction({ userId: "nominator-0", strings: { title: "Replacement", author: "Replacement Author" } });
  await nominate.execute(request);

  assert.notEqual(optionId(0), oldId);
  assert.equal(poll().options[0].title, "Replacement");
  assert.deepEqual(poll().votes, { otherBook: 1, ranked: { second: 1, third: 2 } });
  assert.match(request.response.content, /previous book were cleared/);
  assert.match((await vote(oldId)).content, /no longer available/);
  assert.equal(store.state.nominations.length, 3);
});

test("updating a nomination's reason and cover preserves the same ID and existing votes", async () => {
  const oldId = optionId(0);
  poll().votes = { voter: 0 };
  await nominate.execute(interaction({ userId: "nominator-0", strings: {
    title: "Book A", author: "Author 1", reason: "A new reason", "image-url": "https://example.com/cover.jpg",
  } }));
  assert.equal(optionId(0), oldId);
  assert.deepEqual(poll().votes, { voter: 0 });
  assert.equal(poll().options[0].reason, "A new reason");
  assert.equal(poll().options[0].imageUrl, "https://example.com/cover.jpg");
});

test("nomination edits and removals after the deadline leave both collections unchanged", async () => {
  poll().closesAt = new Date(Date.now() - 1);
  const before = structuredClone(store.state);
  const edit = interaction({ userId: "nominator-0", strings: { title: "Replacement", author: "Author" } });
  const removal = interaction({ userId: "nominator-0", strings: { nomination: optionId(0) } });
  await nominate.execute(edit);
  await remove.execute(removal);
  assert.match(edit.response.content, /no open book poll/);
  assert.match(removal.response.content, /no open book poll/);
  assert.deepEqual(store.state, before);
});

test("a deadline reached midway through a nomination transaction rolls back the nomination edit", async () => {
  const before = structuredClone(store.state);
  store.nextPollWrite = () => { store.serverNow = new Date(poll().closesAt.getTime() + 1); };
  const request = interaction({ userId: "nominator-0", strings: { title: "Replacement", author: "Author" } });
  await nominate.execute(request);
  assert.match(request.response.content, /Voting has ended/);
  assert.deepEqual(store.state, before);
  assert.equal(edits.length, 0);
});

test("members cannot remove another member's nomination", async () => {
  const before = structuredClone(store.state);
  const request = interaction({ userId: "other-member", strings: { nomination: optionId(0) } });
  await remove.execute(request);
  assert.match(request.response.content, /not yours/);
  assert.deepEqual(store.state, before);
});

test("closing retries after a concurrent vote and uses the same final snapshot for winner and results", async () => {
  poll().votes = { firstVoter: 0 };
  store.nextPollWrite = () => store.mutate((state) => { state.poll.votes = { firstVoter: 1, secondVoter: 1 }; });
  const result = await close();
  assert.ok(store.transactionAttempts >= 2);
  assert.equal(result.closedCount, 1);
  assert.equal(poll().winner.title, "Book B");
  assert.deepEqual(getPollScores(poll()), [0, 2, 0]);
  assert.equal(store.state.books.length, 1);
  assert.equal(store.state.books[0].title, "Book B");
  assert.equal(announcements.length, 1);
  const announcement = announcements[0].embeds[0];
  assert.equal(announcement.fields.find((field) => field.name === "Final score").value, "2 votes");
  assert.match(announcement.fields.find((field) => field.name === "Votes").value, /firstVoter.*Book B/);
  assert.ok(controls(edits.at(-1)).filter((component) => component.label !== "Book details").every((component) => component.disabled));
});

test("two overlapping closers produce one committed winner and one announcement", async () => {
  poll().votes = { voter: 0 };
  const results = await Promise.all([close(), close()]);
  assert.equal(results.reduce((total, result) => total + result.closedCount, 0), 1);
  assert.equal(results.reduce((total, result) => total + result.clearedNominationCount, 0), 3);
  assert.equal(announcements.length, 1);
  assert.equal(store.state.books.length, 1);
  assert.equal(store.state.nominations.length, 0);
});

for (const result of ["winner", "tie"]) {
  test(`a failed ${result} announcement remains queued after closure and is retried`, async () => {
    poll().votes = result === "winner" ? { member: 0 } : { member: 0, another: 1 };
    const channel = await client.channels.fetch();
    const send = channel.send;
    channel.send = async () => { throw new Error("temporary send failure"); };
    await close();
    assert.equal(poll().status, "closed");
    assert.equal(poll().resultAnnouncementPending, true);
    assert.equal(store.state.books.length, result === "winner" ? 1 : 0);
    channel.send = send;
    // A fresh module has no in-memory delivery state; progress lives in MongoDB.
    const restarted = await import(`../dist/poll-closing.js?retry-${result}`);
    await restarted.retryBookPollResults(client);
    assert.equal(poll().resultAnnouncementPending, false);
    assert.equal(announcements.length, 1);
    await checkBookPollSchedule(client);
    assert.equal(announcements.length, 1);
    assert.equal(store.state.books.length, result === "winner" ? 1 : 0);
  });
}

test("retrying a partially delivered result resumes at the unsent page without another everyone mention", async () => {
  poll().votes = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`member-${index}`, 0]));
  const channel = await client.channels.fetch();
  const send = channel.send;
  let attempts = 0;
  channel.send = async (message) => {
    attempts += 1;
    if (attempts === 2) throw new Error("continuation failed");
    await send(message);
  };
  await close();
  assert.equal(poll().resultAnnouncementPending, true);
  assert.equal(poll().resultAnnouncementPage, 1);
  assert.equal(announcements.length, 1);
  channel.send = send;
  await checkBookPollSchedule(client);
  assert.equal(poll().resultAnnouncementPending, false);
  assert.equal(announcements.length, 3);
  assert.equal(announcements.filter(message => message.content?.includes("@everyone")).length, 1);
  assert.equal(new Set(announcements.map(message => message.nonce)).size, 3);
  assert.ok(announcements.every(message => message.enforceNonce));
});

test("an unavailable result channel leaves the result queued until it can be fetched", async () => {
  poll().votes = { member: 0 };
  const fetch = client.channels.fetch;
  client.channels.fetch = async () => null;
  await close();
  assert.equal(poll().resultAnnouncementPending, true);
  client.channels.fetch = fetch;
  await checkBookPollSchedule(client);
  assert.equal(poll().resultAnnouncementPending, false);
  assert.equal(announcements.length, 1);
});

test("a failure clearing nominations rolls back closure and book creation before Discord side effects", async () => {
  poll().votes = { voter: 0 };
  const before = structuredClone(store.state);
  store.nextNominationDelete = () => { throw new Error("simulated database failure"); };
  await assert.rejects(close(), /simulated database failure/);
  assert.deepEqual(store.state, before);
  assert.equal(announcements.length, 0);
  assert.equal(edits.length, 0);
});

test("queued public updates cannot leave a closed poll with voting controls re-enabled", async () => {
  let entered;
  let release;
  const started = new Promise((resolve) => { entered = resolve; });
  const blocked = new Promise((resolve) => { release = resolve; });
  let firstEdit = true;
  beforeEdit = async () => {
    if (!firstEdit) return;
    firstEdit = false;
    entered();
    await blocked;
  };
  const staleRefresh = refreshPollMessage(client, structuredClone(poll()));
  await started;
  poll().votes = { voter: 0 };
  const closing = close();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(poll().status, "closed");
  release();
  await Promise.all([staleRefresh, closing]);
  assert.equal(edits.at(-1).embeds[0].title, "📕  Book Poll Closed");
  assert.ok(controls(edits.at(-1)).filter((component) => component.label !== "Book details").every((component) => component.disabled));
});

test("a poll ID from another server cannot accept a vote", async () => {
  const request = interaction({ guildId: "other-server", customId: buildPollCustomId(poll().pollId, optionId(0), 0) });
  await handleBookPollVote(request);
  assert.match(request.response.content, /Voting has ended/);
  assert.deepEqual(poll().votes, {});
});

for (const alreadyInLibrary of [false, true]) {
  test(`linked library polls ${alreadyInLibrary ? "reuse an existing book" : "add their winner"} while voting and announcements stay local`, async () => {
    const owner = "100000000000000002";
    const linked = "100000000000000003";
    const originalAliases = process.env.BOOK_LIBRARY_ALIASES;
    process.env.BOOK_LIBRARY_ALIASES = JSON.stringify({ [linked]: owner });
    try {
      poll().guildId = linked;
      if (alreadyInLibrary) store.state.books.push({
        _id: "preserved-book-id", documentType: "book", guildId: owner, title: "Book A", normalizedTitle: "book a",
      });
      store.state.nominations.forEach(nomination => { nomination.guildId = linked; });
      const foreignNomination = { ...store.state.nominations[0], guildId: owner };
      store.state.nominations.push(foreignNomination);
      const fetchedChannels = [];
      const fetch = client.channels.fetch;
      client.channels.fetch = async channelId => { fetchedChannels.push(channelId); return fetch(channelId); };

      const foreignVote = interaction({ guildId: owner, customId: buildPollCustomId(poll().pollId, optionId(0), 0) });
      await handleBookPollVote(foreignVote);
      assert.deepEqual(poll().votes, {});
      const foreignClose = await closeActiveBookPolls({ client, guildId: owner, addWinners: true });
      assert.equal(foreignClose.closedCount, 0);
      const localVote = interaction({ guildId: linked, customId: buildPollCustomId(poll().pollId, optionId(0), 0) });
      await handleBookPollVote(localVote);
      assert.deepEqual(poll().votes, { voter: 0 });
      const result = await close();
      assert.equal(result.closedCount, 1);
      assert.equal(store.state.books.length, 1);
      assert.equal(store.state.books[0].guildId, owner);
      assert.equal(store.state.books[0].title, "Book A");
      if (alreadyInLibrary) assert.equal(store.state.books[0]._id, "preserved-book-id");
      assert.equal(poll().guildId, linked);
      assert.deepEqual(store.state.nominations, [foreignNomination]);
      assert.equal(announcements.length, 1);
      assert.ok(fetchedChannels.every(channelId => channelId === poll().channelId));
    } finally {
      if (originalAliases === undefined) delete process.env.BOOK_LIBRARY_ALIASES;
      else process.env.BOOK_LIBRARY_ALIASES = originalAliases;
    }
  });
}
