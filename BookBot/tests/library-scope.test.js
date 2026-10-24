import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { getLibraryGuildId } from "../dist/library-scope.js";

const owner = "100000000000000002";
const linked = "100000000000000003";
const unrelated = "100000000000000004";
const original = process.env.BOOK_LIBRARY_ALIASES;
beforeEach(() => {
  delete process.env.BOOK_LIBRARY_ALIASES;
});
after(() => {
  if (original === undefined) delete process.env.BOOK_LIBRARY_ALIASES;
  else process.env.BOOK_LIBRARY_ALIASES = original;
});

test("unconfigured servers keep their existing isolated libraries", () => {
  assert.equal(getLibraryGuildId(owner), owner);
  assert.equal(getLibraryGuildId(linked), linked);
  assert.equal(getLibraryGuildId(null), null);
});

test("only explicitly linked servers share an owner's records", () => {
  process.env.BOOK_LIBRARY_ALIASES = JSON.stringify({ [linked]: owner });
  assert.equal(getLibraryGuildId(owner), owner);
  assert.equal(getLibraryGuildId(linked), owner);
  assert.equal(getLibraryGuildId(unrelated), unrelated);
  assert.equal(getLibraryGuildId(null), null);
});

test("invalid mapping configuration fails rather than exposing the wrong library", () => {
  for (const value of [
    "invalid",
    "null",
    "[]",
    JSON.stringify({ [linked]: 123 }),
    JSON.stringify({ invalid: owner }),
  ]) {
    process.env.BOOK_LIBRARY_ALIASES = value;
    assert.throws(() => getLibraryGuildId(linked), /BOOK_LIBRARY_ALIASES/);
  }
});

test("alias chains and cycles are rejected", () => {
  for (const aliases of [
    { [linked]: owner, [owner]: linked },
    { [linked]: owner, [owner]: unrelated },
  ]) {
    process.env.BOOK_LIBRARY_ALIASES = JSON.stringify(aliases);
    assert.throws(() => getLibraryGuildId(linked), /alias chains or cycles/);
  }
});
