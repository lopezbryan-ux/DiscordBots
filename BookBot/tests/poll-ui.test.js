import assert from "node:assert/strict";
import { test } from "node:test";
import { pollFixture } from "./helpers/poll-store.js";

process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/book-bot-test";
const { buildPollEmbed, buildPollComponents } = await import("../dist/polls.js");

function view(poll, page = 0, userId) {
  const embed = buildPollEmbed(poll, page).toJSON();
  const rows = buildPollComponents(poll, false, page, userId).map(row => row.toJSON());
  assert.ok(embed.description.length <= 4096);
  assert.ok(embed.title.length <= 256);
  const textLength = embed.title.length + embed.description.length + embed.footer.text.length
    + embed.fields.reduce((sum, field) => {
      assert.ok(field.name.length <= 256);
      assert.ok(field.value.length <= 1024);
      return sum + field.name.length + field.value.length;
    }, 0);
  assert.ok(textLength <= 6000);
  assert.ok(rows.length <= 5);
  for (const row of rows) {
    assert.ok(row.components.length <= 5);
    for (const component of row.components) {
      assert.ok(component.custom_id.length <= 100);
      assert.ok((component.label?.length ?? 0) <= 80);
      assert.ok((component.placeholder?.length ?? 0) <= 150);
      for (const option of component.options ?? []) {
        assert.ok(option.label.length <= 100);
        assert.ok(option.value.length <= 100);
      }
    }
  }
  return { embed, controls: rows.flatMap(row => row.components) };
}

function nominations(pollType = "regular") {
  return { ...pollFixture(pollType), status: "nominating", nominationsCloseAt: null, closesAt: null, options: [] };
}

test("waiting UI explains the first nomination, with no fake deadline or voting buttons", () => {
  const { embed, controls } = view(nominations());
  assert.match(embed.description, /first nomination.*24-hour/);
  assert.match(embed.description, /\/nominate-book/);
  assert.equal(embed.fields[0].value, "Waiting for the first nomination");
  assert.doesNotMatch(embed.description, /Voting has ended|final results/);
  assert.equal(controls.length, 0);
});

test("a running nomination window shows the saved deadline and how to edit nominations", () => {
  const poll = nominations("ranked");
  poll.nominationsCloseAt = new Date(Date.now() + 86_400_000);
  poll.options = pollFixture().options;
  const { embed, controls } = view(poll);
  const timestamp = Math.floor(poll.nominationsCloseAt.getTime() / 1000);
  assert.equal(embed.fields[0].value, `<t:${timestamp}:f> (<t:${timestamp}:R>)`);
  assert.match(embed.description, /\/remove-nomination/);
  assert.match(embed.description, /changes do not reset the timer/);
  assert.match(embed.fields[1].value, /Requires 3 nominations; otherwise the round closes without voting/);
  assert.equal(embed.fields[2].value, "3");
  assert.equal(controls.length, 0);
});

test("a short ranked round explains that voting will not open after its deadline", () => {
  const poll = nominations("ranked");
  poll.nominationsCloseAt = new Date(Date.now() - 1);
  poll.options = pollFixture().options.slice(0, 2);
  const { embed, controls } = view(poll);
  assert.match(embed.description, /ranked round will close without a vote/);
  assert.doesNotMatch(embed.description, /Voting will open/);
  assert.equal(controls.length, 0);
});

test("removing all nominations keeps the countdown and describes the empty list accurately", () => {
  const poll = nominations();
  poll.nominationsCloseAt = new Date(Date.now() + 60_000);
  const { embed } = view(poll);
  assert.match(embed.description, /No books are currently nominated/);
  assert.doesNotMatch(embed.fields[0].value, /Waiting/);
  assert.equal(embed.fields[2].value, "0");
});

test("an elapsed nomination window stops inviting submissions while the scheduler catches up", () => {
  const poll = nominations();
  poll.nominationsCloseAt = new Date(Date.now() - 1);
  poll.options = pollFixture().options;
  const { embed, controls } = view(poll);
  assert.equal(embed.title, "📚  Nominations Closed");
  assert.match(embed.description, /Voting will open automatically shortly/);
  assert.doesNotMatch(embed.description, /Use `\/nominate-book`/);
  assert.equal(controls.length, 0);
});

for (const withBooks of [false, true]) {
  test(`a nomination round closed ${withBooks ? "with books" : "without books"} has no voting results or controls`, () => {
    const poll = nominations();
    poll.status = "closed";
    poll.closedAt = new Date();
    if (withBooks) poll.options = pollFixture().options;
    const { embed, controls } = view(poll);
    assert.equal(embed.title, "📕  Book Nominations Closed");
    assert.match(embed.description, /ended before voting opened/);
    assert.match(embed.description, /\/start-book-poll/);
    assert.doesNotMatch(embed.description, /final results|votes cast/);
    assert.equal(controls.length, 0);
  });
}

for (const pollType of ["regular", "ranked"]) {
  test(`${pollType} voting UI locks nominations, hides results, and disables voting at the deadline`, () => {
    const poll = pollFixture(pollType);
    poll.nominationsCloseAt = new Date(Date.now() - 1);
    poll.votes = pollType === "regular" ? { member: 0 } : { member: { first: 0, second: 1, third: 2 } };
    const active = view(poll);
    assert.equal(active.embed.title, "📚  Vote for Our Next Book");
    assert.match(active.embed.description, /Nominations are locked/);
    assert.doesNotMatch(active.embed.description, /<@member>|⭐|█/);
    assert.ok(active.controls.some(control => !control.disabled));
    if (pollType === "ranked") assert.equal(view(poll, 0, "member").controls.length, 3);

    poll.closesAt = new Date(Date.now() - 1);
    const expired = view(poll);
    assert.equal(expired.embed.title, "📕  Book Poll Closed");
    assert.match(expired.embed.description, /final results/);
    assert.ok(expired.controls.every(control => control.disabled));
  });

  test(`${pollType} long nomination lists stay within Discord limits across all stages and pages`, () => {
    const poll = pollFixture(pollType);
    poll.nominationsCloseAt = new Date(Date.now() + 60_000);
    poll.options = Array.from({ length: 45 }, (_, index) => ({
      ...poll.options[0], nominationId: `long-book-${index}`,
      title: `Book ${index} ${"a long title ".repeat(100)}`, author: "Author ".repeat(28),
      imageUrl: `https://example.com/${"cover".repeat(180)}.jpg`,
    }));
    for (const status of ["nominating", "active", "closed"]) {
      poll.status = status;
      for (let page = 0; page < 3; page++) {
        const { embed } = view(poll, page);
        const expectedOptions = page === 2 ? 5 : 20;
        assert.equal((embed.description.match(/\*\*\d+  ·  /g) ?? []).length, expectedOptions);
        assert.match(embed.footer.text, new RegExp(`Page ${page + 1} of 3`));
        if (status === "active" && pollType === "ranked") view(poll, page, "member");
      }
    }
  });
}
