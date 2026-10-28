import assert from "node:assert/strict";
import test from "node:test";
import { REST } from "discord.js";
import { createSource } from "../dist/discord.js";
import { safeError } from "../dist/config.js";
import { ids } from "./ids.mjs";
import {
  applicationId,
  commandApplication,
  commandFixture,
  globalCommandId,
  guildCommandId,
} from "./command-fixture.mjs";

const restrict = {
  action: "restrict",
  guildId: ids.guild,
  applicationId,
  channelIds: [ids.general],
};
function setup(t, app = commandApplication) {
  const mock = commandFixture();
  for (const [method, fn] of Object.entries(mock.handlers))
    t.mock.method(REST.prototype, method, fn);
  return {
    ...mock,
    source: createSource("fictional-inspection-token", [ids.guild], [app]),
  };
}

test("command tools enforce server/application scope and strict schemas before network calls", async (t) => {
  const { source, commandState: state } = setup(t);
  for (const request of [
    { ...restrict, guildId: "100000000000000099" },
    { ...restrict, applicationId: "100000000000000099" },
    { ...restrict, channelIds: [ids.general, ids.general] },
    { ...restrict, token: "never-pass-tokens-in-tools" },
    { ...restrict, action: "unsupported" },
    { ...restrict, channelIds: [] },
    {
      action: "set",
      guildId: ids.guild,
      applicationId,
      changes: [
        { targetType: "allChannels", value: "deny" },
        { targetType: "allChannels", value: "allow" },
      ],
    },
  ])
    await assert.rejects(source.commands(request));
  assert.equal(state.calls.length, 0);
});

test("configured application discovery returns no credentials or file paths", async (t) => {
  const { source, commandState: state } = setup(t);
  const result = await source.commands({
    action: "applications",
    guildId: ids.guild,
  });
  assert.deepEqual(result.applications, [
    { applicationId, name: commandApplication.name, oauthConfigured: true },
  ]);
  assert.ok(!JSON.stringify(result).includes(commandApplication.botToken));
  assert.ok(!JSON.stringify(result).includes(commandApplication.oauthToken));
  assert.equal(state.calls.length, 0);
});

test("inspection returns both command scopes and identifies individual overrides using Bot auth only", async (t) => {
  const { source, commandState: state } = setup(t);
  const result = await source.commands({
    action: "inspect",
    guildId: ids.guild,
    applicationId,
  });
  assert.deepEqual(
    result.commands.map((c) => c.scope),
    ["global", "guild"],
  );
  assert.deepEqual(result.explicitCommandPermissionIds, [guildCommandId]);
  assert.equal(result.applicationPermissions.id, applicationId);
  assert.equal(state.puts.length, 0);
  assert.ok(state.calls.every((c) => c.authPrefix === "Bot"));
});

test("dry runs can preview without OAuth, explicitly mark it unverified, and never mutate permissions", async (t) => {
  const { source, commandState: state } = setup(t, {
    ...commandApplication,
    oauthToken: undefined,
  });
  const before = structuredClone(state.records);
  const result = await source.commands({ ...restrict, dryRun: true });
  assert.equal(result.authorization.configured, false);
  assert.equal(result.authorization.verified, false);
  assert.equal(result.applied, false);
  assert.equal(result.after, null);
  assert.deepEqual(result.proposed.permissions, [
    { id: ids.demon, type: 1, permission: false },
    { id: String(BigInt(ids.guild) - 1n), type: 3, permission: false },
    { id: ids.general, type: 3, permission: true },
  ]);
  assert.deepEqual(state.records, before);
  assert.equal(state.puts.length, 0);
  await assert.rejects(
    source.commands(restrict),
    /user-authorized OAuth token/,
  );
  assert.equal(state.puts.length, 0);
});

test("application-wide restriction uses Bearer auth for PUT and preserves roles and individual command overrides", async (t) => {
  const { source, commandState: state } = setup(t);
  const individual = structuredClone(
    state.records.find((r) => r.id === guildCommandId),
  );
  const result = await source.commands(restrict);
  assert.equal(result.applied, true);
  assert.equal(result.authorization.verified, true);
  assert.equal(result.scope, "applicationDefaults");
  assert.equal(
    state.puts[0].path,
    `/applications/${applicationId}/guilds/${ids.guild}/commands/${applicationId}/permissions`,
  );
  assert.equal(state.puts[0].authPrefix, "Bearer");
  assert.deepEqual(
    state.records.find((r) => r.id === guildCommandId),
    individual,
  );
  assert.ok(
    result.after.permissions.some((p) => p.type === 1 && !p.permission),
  );
  assert.equal(
    JSON.stringify(result).includes(commandApplication.oauthToken),
    false,
  );
  const repeated = await source.commands(restrict);
  assert.equal(repeated.applied, false);
  assert.equal(state.puts.length, 1);
});

test("a single command restriction preserves member rules and leaves application defaults untouched", async (t) => {
  const { source, commandState: state } = setup(t);
  const defaults = structuredClone(state.records[0]);
  const result = await source.commands({
    ...restrict,
    commandId: guildCommandId,
  });
  assert.equal(result.scope, "command");
  assert.ok(
    result.after.permissions.some(
      (p) => p.type === 2 && p.id === ids.member && p.permission,
    ),
  );
  assert.deepEqual(
    state.records.find((r) => r.id === applicationId),
    defaults,
  );
  assert.equal(
    state.puts[0].path.endsWith(`/${guildCommandId}/permissions`),
    true,
  );
});

test("patching supports allow/deny/inherit, preserves unmentioned entries, and accepts global commands", async (t) => {
  const { source, commandState: state } = setup(t);
  const result = await source.commands({
    action: "set",
    guildId: ids.guild,
    applicationId,
    changes: [
      { targetType: "role", targetId: ids.demon, value: "inherit" },
      { targetType: "member", targetId: ids.member, value: "allow" },
      { targetType: "allChannels", value: "deny" },
    ],
  });
  assert.equal(
    result.after.permissions.some((p) => p.type === 1 && p.id === ids.demon),
    false,
  );
  assert.ok(
    result.after.permissions.some(
      (p) => p.type === 3 && p.id === ids.general && p.permission,
    ),
  );
  assert.ok(
    result.after.permissions.some(
      (p) => p.type === 2 && p.id === ids.member && p.permission,
    ),
  );
  const global = await source.commands({
    ...restrict,
    commandId: globalCommandId,
  });
  assert.equal(global.applied, true);
  assert.equal(state.puts.length, 2);
});

test("foreign commands/channels/roles, categories, threads, and oversized permission lists are rejected without writes", async (t) => {
  const { source, commandState: state } = setup(t);
  for (const request of [
    { ...restrict, commandId: "100000000000000099" },
    { ...restrict, channelIds: ["100000000000000099"] },
    { ...restrict, channelIds: [ids.category] },
    {
      action: "set",
      guildId: ids.guild,
      applicationId,
      changes: [
        { targetType: "role", targetId: "100000000000000099", value: "allow" },
      ],
    },
  ])
    await assert.rejects(source.commands(request));
  state.records[0].permissions = Array.from({ length: 100 }, (_, i) => ({
    id: String(100000000000000200n + BigInt(i)),
    type: 1,
    permission: false,
  }));
  await assert.rejects(source.commands(restrict), /at most 100/);
  assert.equal(state.puts.length, 0);
});

test("wrong bot identity and mismatched API response scopes are rejected", async (t) => {
  const { source, commandState: state } = setup(t);
  state.identityId = "100000000000000099";
  await assert.rejects(source.commands(restrict), /different application/);
  state.identityId = applicationId;
  state.records[0].guild_id = "100000000000000099";
  await assert.rejects(
    source.commands(restrict),
    /different application or server/,
  );
  assert.equal(state.puts.length, 0);
});

test("OAuth app binding, required scope, user identity, expiry and server permissions are checked", async (t) => {
  const { source, commandState: state } = setup(t);
  const valid = structuredClone(state.authorization);
  for (const change of [
    { application: { id: "100000000000000099" } },
    { scopes: ["identify"] },
    { user: undefined },
    { expires: new Date(Date.now() - 1000).toISOString() },
    { user: { id: ids.member } },
  ]) {
    state.authorization = { ...structuredClone(valid), ...change };
    await assert.rejects(source.commands(restrict));
  }
  assert.equal(state.puts.length, 0);
});

test("concurrent permission patches retain both edits and a failed update does not poison the server queue", async (t) => {
  const { source, commandState: state } = setup(t);
  const request = (targetId) => ({
    action: "set",
    guildId: ids.guild,
    applicationId,
    changes: [{ targetType: "channel", targetId, value: "deny" }],
  });
  await Promise.all([
    source.commands(request(ids.general)),
    source.commands(request(ids.entrance)),
  ]);
  assert.ok(
    state.records
      .find((r) => r.id === applicationId)
      .permissions.some((p) => p.id === ids.general && !p.permission),
  );
  assert.ok(
    state.records
      .find((r) => r.id === applicationId)
      .permissions.some((p) => p.id === ids.entrance && !p.permission),
  );
  state.failPut = true;
  try {
    await source.commands(restrict);
    assert.fail("Expected write error");
  } catch (error) {
    assert.ok(!safeError(error).includes("sensitive-token"));
  }
  state.failPut = false;
  assert.equal((await source.commands(restrict)).applied, true);
});
