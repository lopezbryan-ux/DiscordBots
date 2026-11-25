import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { MessageFlags } from "discord.js";
import { pollFixture } from "./helpers/poll-store.js";

process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/book-bot-test";
const { mongoClient } = await import("../dist/mongo.js");
const { buildPollDetailsCustomId, buildPollDetailsView, handleBookPollDetails } = await import("../dist/poll-details.js");
const originalDb = mongoClient.db;
let poll;
let reads;

before(() => {
  mongoClient.db = () => ({ collection: () => ({
    async findOne(query) {
      reads += 1;
      return poll && query.pollId === poll.pollId && query.guildId === poll.guildId ? structuredClone(poll) : null;
    },
    async updateOne() { assert.fail("Reading details must not change the poll or votes"); },
  }) });
});
beforeEach(() => {
  poll = pollFixture();
  poll.options[0].reason = "I love the characters.\nThere is plenty for us to discuss!";
  poll.options[0].imageUrl = "https://example.com/cover-a.jpg";
  poll.votes = { "private-voter": 1 };
  reads = 0;
});
after(async () => { mongoClient.db = originalDb; await mongoClient.close(); });

function serialize(message) {
  return {
    ...message,
    embeds: message.embeds?.map(embed => embed.toJSON()),
    components: message.components?.map(row => row.toJSON()),
  };
}

function request({ customId = buildPollDetailsCustomId(poll.pollId, poll.options[0].nominationId), guildId = poll.guildId, ephemeral = false } = {}) {
  return {
    customId, guildId, message: { flags: { has: flag => flag === MessageFlags.Ephemeral && ephemeral } },
    async deferReply(options) { this.deferredReply = options; },
    async deferUpdate() { this.deferredUpdate = true; },
    async reply(message) { this.response = serialize(message); },
    async editReply(message) { this.response = serialize(message); },
  };
}

test("opening details privately shows the full reason, cover, author and nominator without revealing votes", async () => {
  const before = structuredClone(poll);
  const interaction = request();
  await handleBookPollDetails(interaction);
  assert.equal(interaction.deferredReply.flags, MessageFlags.Ephemeral);
  const embed = interaction.response.embeds[0];
  assert.equal(embed.title, "Book A");
  assert.equal(embed.description, `**Why this book?**\n${poll.options[0].reason}`);
  assert.equal(embed.thumbnail.url, poll.options[0].imageUrl);
  assert.equal(embed.fields.find(field => field.name === "Author").value, "Author 1");
  assert.equal(embed.fields.find(field => field.name === "Nominated by").value, "<@nominator-0>");
  assert.doesNotMatch(JSON.stringify(interaction.response), /private-voter|Vote 1|rank-open/);
  assert.deepEqual(interaction.response.allowedMentions, { parse: [] });
  assert.deepEqual(poll, before);
});

test("a book with only a cover still displays it and explains that no reason was supplied", async () => {
  poll.options[0].reason = null;
  const interaction = request();
  await handleBookPollDetails(interaction);
  assert.match(interaction.response.embeds[0].description, /No reason was provided/);
  assert.equal(interaction.response.embeds[0].thumbnail.url, poll.options[0].imageUrl);
});

test("a book without a cover or author displays its reason without an empty image", async () => {
  poll.options[0].imageUrl = null;
  poll.options[0].author = null;
  const interaction = request();
  await handleBookPollDetails(interaction);
  assert.equal(interaction.response.embeds[0].thumbnail, undefined);
  assert.match(interaction.response.embeds[0].description, /I love the characters/);
  assert.equal(interaction.response.embeds[0].fields[0].value, "Not provided");
});

test("private navigation follows stable book IDs even if an earlier nomination is removed", async () => {
  const open = request({ customId: buildPollDetailsCustomId(poll.pollId, poll.options[1].nominationId) });
  await handleBookPollDetails(open);
  const next = open.response.components[0].components.find(button => button.label === "Next book");
  poll.options.shift();
  const interaction = request({ customId: next.custom_id, ephemeral: true });
  await handleBookPollDetails(interaction);
  assert.equal(interaction.deferredUpdate, true);
  assert.equal(interaction.deferredReply, undefined);
  assert.equal(interaction.response.embeds[0].title, "Book C");
  assert.match(interaction.response.embeds[0].footer.text, /Book 2 of 2/);
});

test("refresh reads updated reasons and covers and clears a removed cover", async () => {
  const open = request();
  await handleBookPollDetails(open);
  const refresh = open.response.components[0].components.find(button => button.label === "Refresh").custom_id;
  poll.options[0].reason = "Updated explanation";
  poll.options[0].imageUrl = "https://example.com/updated-cover.jpg";
  const updated = request({ customId: refresh, ephemeral: true });
  await handleBookPollDetails(updated);
  assert.match(updated.response.embeds[0].description, /Updated explanation/);
  assert.equal(updated.response.embeds[0].thumbnail.url, poll.options[0].imageUrl);
  poll.options[0].imageUrl = null;
  await handleBookPollDetails(updated);
  assert.equal(updated.response.embeds[0].thumbnail, undefined);
  assert.equal(reads, 3);
});

test("a removed or replaced nomination never opens a different book at its old position", async () => {
  const interaction = request({ ephemeral: true });
  poll.options.shift();
  await handleBookPollDetails(interaction);
  assert.match(interaction.response.content, /removed or replaced/);
  assert.deepEqual(interaction.response.embeds, []);
  assert.deepEqual(interaction.response.components, []);
});

test("details remain readable from saved poll options after voting closes", async () => {
  poll.status = "closed";
  const interaction = request();
  await handleBookPollDetails(interaction);
  assert.equal(interaction.response.embeds[0].title, "Book A");
  assert.match(interaction.response.embeds[0].description, /I love the characters/);
});

test("details from another server cannot expose book reasons or covers", async () => {
  const interaction = request({ guildId: "another-fictional-guild" });
  await handleBookPollDetails(interaction);
  assert.equal(interaction.deferredReply.flags, MessageFlags.Ephemeral);
  assert.match(interaction.response.content, /no longer available in this server/);
  assert.deepEqual(interaction.response.embeds, []);
});

test("invalid detail controls are rejected without a database read", async () => {
  for (const customId of ["book-poll:details", "book-poll:details:poll:book:invalid", "book-poll:details::book:open"]) {
    const interaction = request({ customId });
    await handleBookPollDetails(interaction);
    assert.match(interaction.response.content, /button is invalid/);
    assert.equal(interaction.response.flags, MessageFlags.Ephemeral);
  }
  assert.equal(reads, 0);
});

test("detail cards retain a maximum-length reason and fit Discord limits with distinct button IDs", () => {
  poll.options = [poll.options[0]];
  poll.options[0].title = "📚".repeat(2000);
  poll.options[0].author = "A".repeat(200);
  poll.options[0].reason = "R".repeat(1000);
  const view = serialize(buildPollDetailsView(poll, poll.options[0].nominationId));
  const embed = view.embeds[0];
  assert.ok(embed.title.length <= 256);
  assert.ok(!/[\uD800-\uDBFF]…$/.test(embed.title));
  assert.equal(embed.description, `**Why this book?**\n${poll.options[0].reason}`);
  assert.ok(embed.description.length <= 4096);
  assert.ok(embed.title.length + embed.description.length + embed.footer.text.length + embed.fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0) <= 6000);
  const buttons = view.components[0].components;
  assert.equal(new Set(buttons.map(button => button.custom_id)).size, buttons.length);
  assert.ok(buttons.every(button => button.custom_id.length <= 100));
  assert.equal(buttons[0].disabled, true);
  assert.equal(buttons[1].disabled, false);
  assert.equal(buttons[2].disabled, true);
});
