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
    "Discord request failed. Check local configuration and connectivity; inspect the resource before retrying a write.",
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

test("per-application credentials are isolated, relative paths are resolved, and a missing OAuth file permits inspection", () => {
  const dir = mkdtempSync(join(tmpdir(), "discord-command-config-"));
  try {
    writeFileSync(
      join(dir, "bot.env"),
      `CLIENT_ID=${ids.member}\nDISCORD_TOKEN=fictional-command-token\nMONGODB_URI=must-not-be-imported\n`,
    );
    writeFileSync(
      join(dir, "oauth.env"),
      "DISCORD_OAUTH_ACCESS_TOKEN=fictional-command-oauth\n",
    );
    const entries = [
      {
        applicationId: ids.member,
        name: "Configured bot",
        botEnvFile: "bot.env",
        oauthEnvFile: "oauth.env",
      },
    ];
    writeFileSync(join(dir, "apps.json"), JSON.stringify(entries));
    const env = {
      DISCORD_MCP_CONFIG: join(dir, "missing.env"),
      DISCORD_BOT_TOKEN: "fictional-main-token",
      DISCORD_ALLOWED_GUILDS: ids.guild,
      DISCORD_COMMAND_APPLICATIONS_FILE: "apps.json",
    };
    const before = process.env.DISCORD_OAUTH_ACCESS_TOKEN;
    const config = readConfig(env);
    assert.equal(config.token, "fictional-main-token");
    assert.deepEqual(config.applications, [
      {
        id: ids.member,
        name: "Configured bot",
        botToken: "fictional-command-token",
        oauthToken: "fictional-command-oauth",
      },
    ]);
    assert.equal(process.env.DISCORD_OAUTH_ACCESS_TOKEN, before);
    entries[0].oauthEnvFile = "not-authorized-yet.env";
    writeFileSync(join(dir, "apps.json"), JSON.stringify(entries));
    assert.equal(readConfig(env).applications[0].oauthToken, undefined);
    entries.push(entries[0]);
    writeFileSync(join(dir, "apps.json"), JSON.stringify(entries));
    assert.throws(
      () => readConfig(env),
      /Cannot load DISCORD_COMMAND_APPLICATIONS_FILE/,
    );
    entries.pop();
    entries[0].applicationId = ids.owner;
    writeFileSync(join(dir, "apps.json"), JSON.stringify(entries));
    assert.throws(
      () => readConfig(env),
      /Cannot load DISCORD_COMMAND_APPLICATIONS_FILE/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
