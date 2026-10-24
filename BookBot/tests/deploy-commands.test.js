import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const firstGuild = "100000000000000002";
const secondGuild = "100000000000000003";
const clientId = "100000000000000001";

function deploy(overrides = {}) {
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import { REST, Client } from "discord.js";
    import dotenv from "dotenv";
    dotenv.config = () => ({ parsed: {} });
    const calls = [];
    REST.prototype.put = async function(route, { body }) {
      calls.push({ route, commands: body.map(command => command.name).sort() });
      if (route.includes(process.env.FAIL_GUILD || "never-match")) throw new Error("Missing Access");
      return body;
    };
    Client.prototype.login = async function() { throw new Error("Deployment must not log in a bot"); };
    process.on("exit", () => console.log("DEPLOY_RESULT:" + JSON.stringify(calls)));
    await import("./dist/deploy-commands.js");
  `], {
    cwd: new URL("../", import.meta.url),
    env: {
      ...process.env,
      DISCORD_TOKEN: "test-token",
      CLIENT_ID: clientId,
      MONGODB_URI: "mongodb://127.0.0.1:27017/book-bot-test",
      GUILD_ID: "",
      GUILD_IDS: "",
      FAIL_GUILD: "",
      ...overrides,
    },
    encoding: "utf8",
    timeout: 15000,
  });
  assert.ifError(result.error);
  const report = result.stdout.split("\n").find(line => line.startsWith("DEPLOY_RESULT:"));
  assert.ok(report, result.stderr);
  return { ...result, calls: JSON.parse(report.slice("DEPLOY_RESULT:".length)) };
}

test("deploys the same nonempty command set to every configured server, once each", () => {
  const result = deploy({ GUILD_IDS: ` ${firstGuild}, ${secondGuild}, ${firstGuild}, ` });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls.map(call => call.route), [firstGuild, secondGuild].map(id => `/applications/${clientId}/guilds/${id}/commands`));
  assert.ok(result.calls[0].commands.includes("help"));
  assert.deepEqual(result.calls[0].commands, result.calls[1].commands);
});

test("supports the existing single-server GUILD_ID setting", () => {
  const result = deploy({ GUILD_IDS: undefined, GUILD_ID: firstGuild });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.length, 1);
  assert.ok(result.calls[0].route.includes(firstGuild));
});

test("GUILD_IDS takes precedence over the legacy setting", () => {
  const result = deploy({ GUILD_IDS: secondGuild, GUILD_ID: firstGuild });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.length, 1);
  assert.ok(result.calls[0].route.includes(secondGuild));
});

test("invalid server IDs fail before any Discord writes", () => {
  const result = deploy({ GUILD_IDS: `${firstGuild},invalid` });
  assert.equal(result.status, 1);
  assert.deepEqual(result.calls, []);
  assert.match(result.stderr, /comma-separated Discord server IDs/);
});

test("missing server configuration fails before any Discord writes", () => {
  const result = deploy();
  assert.equal(result.status, 1);
  assert.deepEqual(result.calls, []);
  assert.match(result.stderr, /Set DISCORD_TOKEN, CLIENT_ID, and GUILD_IDS/);
});

test("a failed server does not skip the next server and returns a failure status", () => {
  const result = deploy({ GUILD_IDS: `${firstGuild},${secondGuild}`, FAIL_GUILD: firstGuild });
  assert.equal(result.status, 1);
  assert.equal(result.calls.length, 2);
  assert.match(result.stderr, /Missing Access/);
  assert.match(result.stdout, new RegExp(`Successfully reloaded .* guild ${secondGuild}`));
  assert.doesNotMatch(result.stdout, /Successfully reloaded application \(\/\) commands\./);
});
