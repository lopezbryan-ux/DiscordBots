import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { ObjectId } from "mongodb";

process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/book-bot-test";
const { mongoClient } = await import("../dist/mongo.js");
const { findBookByInput } = await import("../dist/book-club.js");
const commands = Object.fromEntries(await Promise.all([
  "rate-book", "view-rating", "remove-rating", "delete-book", "book-reviews", "update-book",
].map(async (name) => [name, await import(`../dist/commands/${name}.js`)])));
const addBook = await import("../dist/commands/add-book.js");
const { buildBookListMessage } = await import("../dist/book-list-view.js");
const {
  buildBookReviewsMessage, buildRatingListMessage, buildBookLeaderboardMessage,
  getBookRatingSummary, invalidateRatingViewsCache,
} = await import("../dist/rating-views.js");

const guildId = "100000000000000002";
const linkedGuildId = "100000000000000003";
const bookId = new ObjectId("000000000000000000000001");
const otherBookId = new ObjectId("000000000000000000000002");
const foreignBookId = new ObjectId("000000000000000000000003");
const member = { id: "reader-1", username: "Reader One", toString: () => "<@reader-1>" };
let documents;
let operations;

function equal(left, right) {
  return left instanceof ObjectId ? left.equals(right) : left === right;
}

function matches(document, query) {
  return Object.entries(query).every(([key, value]) => {
    if (key === "$or") return value.some((condition) => matches(document, condition));
    if (value && typeof value === "object" && "$ne" in value) return !equal(value.$ne, document[key]);
    if (value && typeof value === "object" && "$in" in value) return value.$in.some((item) => equal(item, document[key]));
    if (value && typeof value === "object" && "$regex" in value) return new RegExp(value.$regex, value.$options).test(document[key] ?? "");
    if (value && typeof value === "object" && "$gte" in value) return document[key] >= value.$gte;
    return equal(value, document[key]);
  });
}

function cursor(source) {
  let result = [...source];
  return {
    collation() { return this; },
    sort(order) {
      result.sort((left, right) => {
        for (const [key, direction] of Object.entries(order)) {
          if (left[key] < right[key]) return -direction;
          if (left[key] > right[key]) return direction;
        }
        return 0;
      });
      return this;
    },
    skip(count) { result = result.slice(count); return this; },
    limit(count) { result = result.slice(0, count); return this; },
    async toArray() { return result.map((document) => ({ ...document })); },
  };
}

const collection = {
  async findOne(query) { return documents.find((document) => matches(document, query)) ?? null; },
  find(query) { return cursor(documents.filter((document) => matches(document, query))); },
  async countDocuments(query) { return documents.filter((document) => matches(document, query)).length; },
  async updateOne(query, update) {
    operations.push({ query, update });
    let document = documents.find((document) => matches(document, query));
    if (!document) {
      document = { _id: new ObjectId(), ...query, ...update.$setOnInsert };
      documents.push(document);
    }
    Object.assign(document, update.$set);
    return { matchedCount: 1 };
  },
  async updateMany(query, update) {
    documents.filter((document) => matches(document, query)).forEach((document) => Object.assign(document, update.$set));
  },
  async deleteOne(query) {
    const index = documents.findIndex((document) => matches(document, query));
    if (index >= 0) documents.splice(index, 1);
    return { deletedCount: index >= 0 ? 1 : 0 };
  },
  aggregate(stages) {
    let result = documents;
    for (const stage of stages) {
      if (stage.$match) result = result.filter((document) => matches(document, stage.$match));
      if (stage.$sort) {
        // Ranking order is irrelevant to the ID association checks in this file.
        result = [...result];
      }
      if (stage.$group) {
        const groups = new Map();
        for (const document of result) {
          const id = stage.$group._id === null ? null : document[stage.$group._id.slice(1)];
          const key = id?.toString() ?? "all";
          groups.set(key, { id, values: [...(groups.get(key)?.values ?? []), document] });
        }
        result = [...groups.values()].map(({ id, values }) => {
          const averageRating = values.reduce((sum, value) => sum + value.rating, 0) / values.length;
          return {
            _id: id, averageRating, ratingCount: values.length,
            bookTitle: values[0].bookTitle, author: values[0].author,
            ratingSpread: Math.sqrt(values.reduce((sum, value) => sum + (value.rating - averageRating) ** 2, 0) / values.length),
          };
        });
      }
    }
    return cursor(result);
  },
};

const originalDb = mongoClient.db;
const originalWithSession = mongoClient.withSession;
before(() => {
  mongoClient.db = () => ({ collection: () => collection });
  mongoClient.withSession = (callback) => callback({ withTransaction: (action) => action() });
});
beforeEach(() => {
  process.env.BOOK_LIBRARY_ALIASES = JSON.stringify({ [linkedGuildId]: guildId });
  const book = {
    _id: bookId, documentType: "book", guildId, title: "Shared Title", normalizedTitle: "shared title",
    author: "First Author", imageUrl: "https://example.com/first.jpg", selectedAt: new Date("2025-01-01"),
  };
  const rating = {
    _id: new ObjectId("000000000000000000000011"), documentType: "rating", guildId, bookId,
    normalizedTitle: "old title", bookTitle: "Old Title", author: "Old Author", userId: member.id,
    username: member.username, rating: 9, review: "First book review.",
    createdAt: new Date("2025-01-01"), updatedAt: new Date("2025-01-02"),
  };
  documents = [
    book,
    { ...book, _id: otherBookId, author: "Second Author", imageUrl: "https://example.com/second.jpg" },
    { ...book, _id: foreignBookId, guildId: "other-server" },
    rating,
    { ...rating, _id: new ObjectId("000000000000000000000012"), bookId: otherBookId, rating: 2, review: "Second book review." },
    { ...rating, _id: new ObjectId("000000000000000000000013"), userId: "reader-2", username: "Reader Two", rating: 7 },
    { ...rating, _id: new ObjectId("000000000000000000000014"), guildId: "other-server", bookId: foreignBookId, rating: 10 },
  ];
  operations = [];
  invalidateRatingViewsCache(guildId);
});
after(async () => {
  mongoClient.db = originalDb;
  mongoClient.withSession = originalWithSession;
  await mongoClient.close();
});

async function execute(name, options = {}, serverId = guildId) {
  const interaction = {
    guildId: serverId, channelId: "channel", user: member,
    options: {
      getString: (name) => options[name] ?? null,
      getNumber: (name) => options[name],
      getUser: () => null,
    },
    async deferReply() {},
    async reply(message) { this.message = message; },
    async editReply(message) { this.message = message; },
  };
  await (name === "add-book" ? addBook : commands[name]).execute(interaction);
  interaction.message.embeds?.forEach((embed) => embed.toJSON());
  return interaction.message;
}

for (const name of Object.keys(commands)) {
  test(`${name} autocomplete returns stable IDs for duplicate and long titles`, async () => {
    documents[0].title = "Shared Title " + "x".repeat(150);
    let choices;
    await commands[name].autocomplete({ guildId, options: { getFocused: () => "Shared" },
      async respond(response) { choices = response; } });
    assert.equal(choices.length, 2);
    assert.deepEqual(new Set(choices.map((choice) => choice.value)), new Set([bookId.toString(), otherBookId.toString()]));
    assert.ok(choices.every((choice) => choice.name.length <= 100));
  });
}

test("title lookup rejects ambiguity and IDs cannot select a book in another server", async () => {
  assert.equal(await findBookByInput(guildId, "Shared Title"), null);
  assert.equal(await findBookByInput(guildId, foreignBookId.toString()), null);
  assert.ok((await findBookByInput(guildId, bookId.toString()))._id.equals(bookId));
  documents[1].normalizedTitle = "different title";
  assert.ok((await findBookByInput(guildId, " SHARED   TITLE "))._id.equals(bookId));
});

test("rating a renamed book edits the original member record without merging another book", async () => {
  const original = { ...documents[3] };
  const other = { ...documents[4] };
  await execute("rate-book", { title: bookId.toString(), rating: 8, review: "Updated review." });
  assert.equal(documents.length, 7);
  assert.ok(documents[3]._id.equals(original._id));
  assert.equal(documents[3].createdAt, original.createdAt);
  assert.equal(documents[3].rating, 8);
  assert.equal(documents[3].review, "Updated review.");
  assert.deepEqual(documents[4], other);
  assert.ok(operations[0].query.bookId.equals(bookId));
  assert.equal(operations[0].query.normalizedTitle, undefined);
});

test("new member ratings store a BSON book ID", async () => {
  documents = documents.filter((document) => !(document.documentType === "rating" && document.userId === member.id && document.bookId.equals(bookId)));
  await execute("rate-book", { title: bookId.toString(), rating: 6, review: "New rating." });
  const created = documents.find((document) => document.documentType === "rating" && document.userId === member.id && document.bookId.equals(bookId));
  assert.equal(created.rating, 6);
  assert.ok(created.createdAt instanceof Date);
  assert.ok(created.bookId instanceof ObjectId);
});

test("reviews, individual ratings, averages, and rating lists use IDs after title changes", async () => {
  assert.deepEqual(await getBookRatingSummary(guildId, bookId), { averageRating: 8, ratingCount: 2 });
  assert.deepEqual(await getBookRatingSummary(guildId, otherBookId), { averageRating: 2, ratingCount: 1 });
  const reviews = await buildBookReviewsMessage(guildId, bookId.toString(), 0);
  assert.equal(reviews.totalRatings, 2);
  assert.ok(reviews.embeds[0].data.fields.every((field) => !field.value.includes("Second book review.")));
  const view = await execute("view-rating", { title: otherBookId.toString() });
  assert.equal(view.embeds[0].data.fields.find((field) => field.name === "Rating").value, "**2.0/10**");
  const list = await buildRatingListMessage(guildId, member.id, member.toString(), 0);
  assert.equal(list.totalRatings, 2);
  assert.equal(list.embeds[0].data.title, "Shared Title");
  assert.equal(list.embeds[0].data.image.url, "https://example.com/first.jpg");
  assert.match(list.embeds[0].data.fields[0].value, /Club average: \*\*8\.0\/10\*\* from 2 ratings/);
});

test("renaming through update-book keeps reviews, rating lists, and leaderboards attached", async () => {
  const originalRatings = documents.filter((document) => document.documentType === "rating").map((rating) => ({ ...rating }));
  await execute("update-book", { title: bookId.toString(), "new-title": "Corrected Book Title" });
  assert.deepEqual(documents.filter((document) => document.documentType === "rating"), originalRatings.map((rating) =>
    rating.bookId.equals(bookId) && rating.guildId === guildId
      ? { ...rating, bookTitle: "Corrected Book Title", normalizedTitle: "corrected book title" }
      : rating));
  const reviews = await execute("book-reviews", { title: bookId.toString() });
  assert.equal(reviews.embeds[0].data.title, "Corrected Book Title");
  assert.equal(reviews.embeds[0].data.fields.length, 2);
  assert.deepEqual(await getBookRatingSummary(guildId, bookId), { averageRating: 8, ratingCount: 2 });
  const list = await buildRatingListMessage(guildId, member.id, member.toString(), 0);
  assert.equal(list.embeds[0].data.title, "Corrected Book Title");
  const leaderboard = await buildBookLeaderboardMessage(guildId, 0);
  assert.equal(leaderboard.totalBooks, 2);
  assert.ok(leaderboard.embeds[0].data.fields.some((field) => field.name.includes("Corrected Book Title")));
});

test("leaderboards keep separate books with the same title and use current book metadata", async () => {
  for (const ranking of ["highest-rated", "most-rated"]) {
    const message = await buildBookLeaderboardMessage(guildId, 0, ranking);
    assert.equal(message.totalBooks, 2);
    const fields = message.embeds[0].data.fields;
    assert.ok(fields.some((field) => field.value.includes("First Author") && field.value.includes("8.0/10")));
    assert.ok(fields.some((field) => field.value.includes("Second Author") && field.value.includes("2.0/10")));
    assert.ok(fields.every((field) => !field.name.includes("Old Title")));
  }
  const divisive = await buildBookLeaderboardMessage(guildId, 0, "most-divisive");
  assert.equal(divisive.totalBooks, 1);
  assert.match(divisive.embeds[0].data.fields[0].value, /First Author/);
});

test("removing a rating and updating an author affect only the selected book ID", async () => {
  const other = { ...documents[4] };
  await execute("update-book", { title: bookId.toString(), author: "Corrected Author" });
  assert.equal(documents[3].author, "Corrected Author");
  assert.deepEqual(documents[4], other);
  await execute("remove-rating", { title: bookId.toString() });
  assert.equal(documents.some((document) => document._id?.toString() === "000000000000000000000011"), false);
  assert.ok(documents.some((document) => document._id?.equals(other._id)));
});

test("deletion checks protect rated books and delete only an unrated book with the same title", async () => {
  const denied = await execute("delete-book", { title: bookId.toString() });
  assert.match(denied.content, /cannot delete/);
  documents = documents.filter((document) => !(document.documentType === "rating" && document.bookId.equals(otherBookId)));
  await execute("delete-book", { title: otherBookId.toString() });
  assert.equal(documents.some((document) => document._id.equals(otherBookId)), false);
  assert.ok(documents.some((document) => document._id.equals(bookId)));
});

test("linked servers browse the same library and autocomplete while other libraries stay isolated", async () => {
  for (const serverId of [guildId, linkedGuildId]) {
    const list = await buildBookListMessage(serverId);
    assert.equal(list.embeds[0].data.fields.length, 2);
    assert.ok((await findBookByInput(serverId, bookId.toString()))._id.equals(bookId));
    assert.equal(await findBookByInput(serverId, foreignBookId.toString()), null);
    for (const command of Object.values(commands)) {
      let choices;
      await command.autocomplete({ guildId: serverId, options: { getFocused: () => "" },
        async respond(response) { choices = response; } });
      assert.deepEqual(choices.map(choice => choice.value).sort(), [bookId, otherBookId].map(id => id.toString()).sort());
    }
  }
  assert.equal(await findBookByInput("other-server", bookId.toString()), null);
  assert.equal(await buildBookListMessage("unlinked-empty-server"), null);
});

for (const serverId of [guildId, linkedGuildId]) {
  test(`books added in ${serverId} can be edited and removed from its linked server`, async () => {
    const otherServer = serverId === guildId ? linkedGuildId : guildId;
    await execute("add-book", { title: "New Shared Book", author: "Shared Author" }, serverId);
    const created = documents.find(document => document.title === "New Shared Book");
    assert.equal(created.guildId, guildId);
    assert.equal((await buildBookListMessage(otherServer)).embeds[0].data.fields.length, 3);
    await execute("update-book", { title: created._id.toString(), "new-title": "Renamed Shared Book" }, otherServer);
    assert.equal((await findBookByInput(serverId, created._id.toString())).title, "Renamed Shared Book");
    await execute("delete-book", { title: created._id.toString() }, otherServer);
    assert.equal(await findBookByInput(serverId, created._id.toString()), null);
    assert.equal((await buildBookListMessage(serverId)).embeds[0].data.fields.length, 2);
  });
}

test("rating from a linked server updates the existing account's rating and shares all rating views", async () => {
  const original = { ...documents[3] };
  await execute("rate-book", { title: bookId.toString(), rating: 10, review: "Updated from the second server." }, linkedGuildId);
  assert.equal(documents.length, 7);
  assert.ok(documents[3]._id.equals(original._id));
  assert.equal(documents[3].createdAt, original.createdAt);
  assert.equal(documents[3].guildId, guildId);
  for (const serverId of [guildId, linkedGuildId]) {
    assert.deepEqual(await getBookRatingSummary(serverId, bookId), { averageRating: 8.5, ratingCount: 2 });
    const reviews = await execute("book-reviews", { title: bookId.toString() }, serverId);
    assert.ok(reviews.embeds[0].data.fields.some(field => field.value.includes("Updated from the second server.")));
    const rating = await execute("view-rating", { title: bookId.toString() }, serverId);
    assert.equal(rating.embeds[0].data.fields.find(field => field.name === "Rating").value, "**10.0/10**");
    assert.equal((await buildRatingListMessage(serverId, member.id, member.toString(), 0)).totalRatings, 2);
    assert.equal((await buildBookLeaderboardMessage(serverId, 0)).totalBooks, 2);
  }
});

test("removing ratings and protecting rated books work from the linked server", async () => {
  const denied = await execute("delete-book", { title: bookId.toString() }, linkedGuildId);
  assert.match(denied.content, /cannot delete/);
  await execute("remove-rating", { title: bookId.toString() }, linkedGuildId);
  assert.deepEqual(await getBookRatingSummary(guildId, bookId), { averageRating: 7, ratingCount: 1 });
  assert.equal((await buildRatingListMessage(guildId, member.id, member.toString(), 0)).totalRatings, 1);
  assert.equal(documents.filter(document => document.documentType === "rating" && document.guildId === "other-server").length, 1);
});

test("updates in either server invalidate the shared leaderboard and book navigation caches", async () => {
  await buildBookLeaderboardMessage(linkedGuildId, 0);
  await buildBookReviewsMessage(guildId, bookId.toString(), 0);
  await execute("rate-book", { title: bookId.toString(), rating: 10 }, guildId);
  const leaderboard = await buildBookLeaderboardMessage(linkedGuildId, 0);
  assert.ok(leaderboard.embeds[0].data.fields.some(field => field.value.includes("8.5/10")));
  await execute("add-book", { title: "Third Book" }, linkedGuildId);
  const reviews = await buildBookReviewsMessage(guildId, bookId.toString(), 0);
  assert.match(reviews.embeds[0].data.footer.text, /Book \d of 3/);
  await execute("update-book", { title: bookId.toString(), "new-title": "Shared Corrected Title", author: "Updated Author" }, linkedGuildId);
  const updated = await buildBookLeaderboardMessage(guildId, 0);
  assert.ok(updated.embeds[0].data.fields.some(field => field.name.includes("Shared Corrected Title") && field.value.includes("Updated Author")));
});
