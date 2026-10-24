import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REST } from "discord.js";
import { readConfig, safeError } from "../dist/config.js";
import { createSource } from "../dist/discord.js";
import { fixture, ids } from "./fixture.mjs";

test("configuration requires a token and an explicit valid server allowlist", () => {
  const base = { DISCORD_MCP_CONFIG: "/missing/discord-mcp-test-config" };
  assert.throws(() => readConfig(base), /Set DISCORD_BOT_TOKEN/);
  assert.throws(
    () => readConfig({ ...base, DISCORD_BOT_TOKEN: "secret" }),
    /DISCORD_ALLOWED_GUILDS/,
  );
  assert.throws(
    () =>
      readConfig({
        ...base,
        DISCORD_BOT_TOKEN: "secret",
        DISCORD_ALLOWED_GUILDS: "*",
      }),
    /DISCORD_ALLOWED_GUILDS/,
  );
  assert.deepEqual(
    readConfig({
      ...base,
      DISCORD_BOT_TOKEN: "secret",
      DISCORD_ALLOWED_GUILDS: `${ids.guild}, ${ids.guild}`,
    }).guildIds,
    [ids.guild],
  );
});

test("external bot credentials are loaded without changing process environment", () => {
  const dir = mkdtempSync(join(tmpdir(), "discord-mcp-"));
  try {
    writeFileSync(
      join(dir, "bot.env"),
      "DISCORD_TOKEN=example-only-secret\nMONGODB_URI=unused\n",
    );
    writeFileSync(
      join(dir, ".env"),
      `DISCORD_ALLOWED_GUILDS=${ids.guild}\nDISCORD_ENV_FILE=${join(dir, "bot.env")}\n`,
    );
    const before = process.env.DISCORD_TOKEN;
    const config = readConfig({ DISCORD_MCP_CONFIG: join(dir, ".env") });
    assert.equal(config.token, "example-only-secret");
    assert.equal(process.env.DISCORD_TOKEN, before);
    assert.equal("MONGODB_URI" in config, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("upstream error details and credentials are never forwarded", () => {
  assert.equal(
    safeError(new Error("Authorization: Bot do-not-print-me")),
    "Discord inspection failed. Check local configuration and connectivity.",
  );
  assert.equal(
    safeError({ status: 403, message: "do-not-print-me" }),
    "The bot does not have access to this Discord resource.",
  );
});

test("a disallowed server is rejected before any network operation", async (t) => {
  const get = t.mock.method(REST.prototype, "get", () => {
    throw new Error("Network must not be touched");
  });
  const source = createSource("not-a-real-token", [ids.guild]);
  await assert.rejects(
    source.snapshot("99999999999999999"),
    /not in DISCORD_ALLOWED_GUILDS/,
  );
  await assert.rejects(
    source.member("99999999999999999", ids.member),
    /not in DISCORD_ALLOWED_GUILDS/,
  );
  assert.equal(get.mock.callCount(), 0);
});

test("snapshot and member retrieval only issue scoped GET requests", async (t) => {
  const s = fixture();
  const paths = [];
  t.mock.method(REST.prototype, "get", async (path) => {
    paths.push(path);
    if (path.endsWith("/roles")) return s.roles;
    if (path.endsWith("/channels")) return s.channels;
    if (path.includes("/members/")) return { roles: [ids.demon] };
    return s.guild;
  });
  const source = createSource("not-a-real-token", [ids.guild]);
  const got = await source.snapshot(ids.guild);
  assert.equal(got.guild.id, ids.guild);
  await source.member(ids.guild, ids.member);
  assert.deepEqual(
    paths.sort(),
    [
      `/guilds/${ids.guild}`,
      `/guilds/${ids.guild}/roles`,
      `/guilds/${ids.guild}/channels`,
      `/guilds/${ids.guild}/members/${ids.member}`,
    ].sort(),
  );
});
