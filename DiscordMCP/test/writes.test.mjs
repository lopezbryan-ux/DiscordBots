import assert from "node:assert/strict";
import test from "node:test";
import { REST, PermissionFlagsBits as P } from "discord.js";
import { createSource } from "../dist/discord.js";
import { ids, overwrite, role } from "./fixture.mjs";
import { botId, botRoleId, writeFixture } from "./write-fixture.mjs";

function setup(t) {
  const mock = writeFixture();
  for (const [name, handler] of Object.entries(mock.handlers))
    t.mock.method(REST.prototype, name, handler);
  return { ...mock, source: createSource("fictional-test-token", [ids.guild]) };
}
const request = (action, fields = {}) => ({
  guildId: ids.guild,
  action,
  ...fields,
});
const actions = [
  request("createRole", { name: "Readers" }),
  request("updateRole", { roleId: ids.demon, name: "Readers" }),
  request("setMemberRole", {
    memberId: ids.member,
    roleId: ids.smiters,
    assigned: true,
  }),
  request("createChannel", { name: "books" }),
  request("updateChannel", { channelId: ids.general, name: "books" }),
  request("setChannelOverwrite", {
    channelId: ids.general,
    targetId: ids.demon,
    targetType: "role",
    changes: [{ permission: "ViewChannel", value: "allow" }],
  }),
  request("deleteChannelOverwrite", {
    channelId: ids.entrance,
    targetId: ids.guild,
    targetType: "role",
  }),
];

test("all write tools reject disallowed servers before network access", async (t) => {
  const { source, calls } = setup(t);
  for (const action of actions)
    await assert.rejects(
      source.write({ ...action, guildId: "99999999999999999" }),
      /DISCORD_ALLOWED_GUILDS/,
    );
  assert.equal(calls.length, 0);
});

test("write schemas reject unknown fields, flags, invalid IDs, and missing changes before network access", async (t) => {
  const { source, calls } = setup(t);
  for (const input of [
    request("createRole", { name: "Readers", permissions: ["InventedFlag"] }),
    request("createRole", { name: "Readers", token: "must-not-be-accepted" }),
    request("createRole", {
      name: "Readers",
      permissions: ["ViewChannel"],
      dryRun: "false",
    }),
    request("updateChannel", { channelId: "invalid", name: "books" }),
    request("setMemberRole", {
      memberId: ids.member,
      roleId: ids.demon,
      assigned: true,
      roles: [],
    }),
    request("setChannelOverwrite", {
      channelId: ids.general,
      targetId: ids.guild,
      targetType: "role",
      changes: [],
    }),
  ])
    await assert.rejects(source.write(input), /Invalid Discord write request/);
  assert.equal(calls.length, 0);
});

test("every write supports a dry run that leaves Discord unchanged", async (t) => {
  const { source, state, members, mutations } = setup(t);
  const original = structuredClone({ state, members });
  for (const action of actions) {
    const result = await source.write({ ...action, dryRun: true });
    assert.equal(result.dryRun, true);
    assert.equal(result.applied, false);
    assert.ok(Object.hasOwn(result, "proposed"));
  }
  assert.equal(mutations().length, 0);
  assert.deepEqual({ state, members }, original);
});

test("role creation and updates use audit reasons and preserve unmentioned permission bits", async (t) => {
  const { source, state, mutations } = setup(t);
  const created = await source.write(
    request("createRole", {
      name: "Readers",
      color: 0x123456,
      hoist: true,
      reason: "Reading club",
    }),
  );
  assert.equal(created.after.permissions, "0");
  assert.equal(created.after.color, 0x123456);
  assert.equal(mutations()[0].method, "post");
  assert.equal(mutations()[0].reason, "Reading club");
  const unknown = 1n << 90n;
  state.roles.find((entry) => entry.id === ids.demon).permissions = (
    P.ViewChannel | unknown
  ).toString();
  const updated = await source.write(
    request("updateRole", {
      roleId: ids.demon,
      grantPermissions: ["SendMessages"],
      revokePermissions: ["ViewChannel"],
      mentionable: false,
    }),
  );
  assert.equal(
    updated.after.permissions,
    (P.SendMessages | unknown).toString(),
  );
  assert.equal(updated.after.mentionable, false);
  assert.equal(mutations()[1].method, "patch");
  assert.equal(mutations()[1].path, `/guilds/${ids.guild}/roles/${ids.demon}`);
});

test("role editing rejects hierarchy violations, managed roles, and privilege escalation", async (t) => {
  const { source, state, mutations } = setup(t);
  state.roles.find((entry) => entry.id === ids.admin).position = 7;
  for (const action of [
    request("updateRole", { roleId: ids.admin, name: "Too high" }),
    request("updateRole", { roleId: botRoleId, name: "Managed" }),
    request("createRole", { name: "Admin", permissions: ["Administrator"] }),
    request("updateRole", {
      roleId: ids.demon,
      grantPermissions: ["BanMembers"],
    }),
    request("updateRole", {
      roleId: ids.demon,
      grantPermissions: ["ViewChannel"],
      revokePermissions: ["ViewChannel"],
    }),
    request("updateRole", { roleId: ids.guild, name: "Everyone" }),
    request("updateRole", {
      roleId: "99999999999999999",
      name: "Other server",
    }),
  ])
    await assert.rejects(source.write(action));
  state.roles.find((entry) => entry.id === botRoleId).permissions =
    P.Administrator.toString();
  await assert.rejects(
    source.write(
      request("updateRole", { roleId: ids.admin, name: "Still too high" }),
    ),
    /below the bot/,
  );
  assert.equal(mutations().length, 0);
});

test("role hierarchy resolves equal positions using snowflake order", async (t) => {
  const { source, state, mutations } = setup(t);
  state.roles.find((entry) => entry.id === ids.demon).position = 5;
  await assert.rejects(
    source.write(
      request("updateRole", {
        roleId: ids.demon,
        name: "Equal position, older ID",
      }),
    ),
    /below the bot/,
  );
  state.roles.push(
    role("100000000000000030", "Equal position, newer ID", 0n, 5),
  );
  await source.write(
    request("updateRole", { roleId: "100000000000000030", name: "Lower" }),
  );
  assert.equal(mutations().length, 1);
});

test("member role assignment preserves other roles and skips already satisfied requests", async (t) => {
  const { source, members, mutations } = setup(t);
  const action = request("setMemberRole", {
    memberId: ids.member,
    roleId: ids.smiters,
    assigned: true,
  });
  await source.write(action);
  assert.deepEqual(members.get(ids.member).roles, [ids.demon, ids.smiters]);
  const noOp = await source.write(action);
  assert.equal(noOp.changed, false);
  assert.equal(noOp.applied, false);
  await source.write({ ...action, assigned: false });
  assert.deepEqual(members.get(ids.member).roles, [ids.demon]);
  assert.deepEqual(
    mutations().map((call) => call.method),
    ["put", "delete"],
  );
  await assert.rejects(
    source.write({ ...action, roleId: ids.guild }),
    /@everyone/,
  );
  await assert.rejects(
    source.write({ ...action, memberId: "99999999999999999" }),
  );
  assert.equal(mutations().length, 2);
});

test("channel creation and updates validate category scope and preserve overwrites", async (t) => {
  const { source, state, mutations } = setup(t);
  const created = await source.write(
    request("createChannel", { name: "Books", parentId: ids.category }),
  );
  const channelId = created.after.id;
  const before = structuredClone(
    state.channels.find((entry) => entry.id === channelId)
      .permission_overwrites,
  );
  const updated = await source.write(
    request("updateChannel", {
      channelId,
      topic: "Reading",
      slowmodeSeconds: 15,
      nsfw: false,
      parentId: null,
    }),
  );
  assert.equal(updated.after.topic, "Reading");
  assert.equal(updated.after.parentId, null);
  assert.equal(updated.after.slowmodeSeconds, 15);
  assert.deepEqual(
    state.channels.find((entry) => entry.id === channelId)
      .permission_overwrites,
    before,
  );
  assert.deepEqual(
    mutations().map((call) => call.method),
    ["post", "patch"],
  );
  for (const action of [
    request("createChannel", { name: "Wrong parent", parentId: ids.general }),
    request("createChannel", {
      name: "Foreign parent",
      parentId: "99999999999999999",
    }),
    request("createChannel", {
      name: "Nested",
      type: "category",
      parentId: ids.category,
    }),
    request("createChannel", {
      name: "Voice",
      type: "voice",
      topic: "Invalid",
    }),
    request("updateChannel", {
      channelId: "99999999999999999",
      name: "Foreign",
    }),
    request("updateChannel", {
      channelId: ids.general,
      topic: "x".repeat(1025),
    }),
  ])
    await assert.rejects(source.write(action));
  assert.equal(mutations().length, 2);
});

test("bot management permissions and channel visibility are checked before writes", async (t) => {
  const { source, state, mutations } = setup(t);
  state.roles.find((entry) => entry.id === botRoleId).permissions =
    P.ViewChannel.toString();
  for (const action of actions)
    await assert.rejects(source.write(action), /bot needs/);
  state.roles.find((entry) => entry.id === botRoleId).permissions = (
    P.ViewChannel |
    P.ManageRoles |
    P.ManageChannels
  ).toString();
  state.channels[2].permission_overwrites.push(
    overwrite(botId, 0n, P.ViewChannel, 1),
  );
  await assert.rejects(
    source.write(
      request("updateChannel", { channelId: ids.general, name: "Hidden" }),
    ),
    /View Channel/,
  );
  assert.equal(mutations().length, 0);
});

test("overwrite patches implement allow/deny/inherit and preserve all other bits", async (t) => {
  const { source, state, mutations } = setup(t);
  const unknown = 1n << 90n;
  state.channels[2].permission_overwrites.push(
    overwrite(ids.demon, P.ViewChannel | unknown, P.SendMessages),
  );
  const input = request("setChannelOverwrite", {
    channelId: ids.general,
    targetType: "role",
    targetId: ids.demon,
    changes: [
      { permission: "ViewChannel", value: "inherit" },
      { permission: "SendMessages", value: "allow" },
      { permission: "EmbedLinks", value: "deny" },
    ],
  });
  const result = await source.write(input);
  assert.equal(result.after.allow, (unknown | P.SendMessages).toString());
  assert.equal(result.after.deny, P.EmbedLinks.toString());
  assert.equal(result.after.type, 0);
  assert.equal(
    mutations()[0].path,
    `/channels/${ids.general}/permissions/${ids.demon}`,
  );
  await source.write({ ...input, targetType: "member", targetId: ids.member });
  assert.equal(mutations()[1].body.type, 1);
  const removed = await source.write(
    request("deleteChannelOverwrite", {
      channelId: ids.general,
      targetType: "role",
      targetId: ids.demon,
    }),
  );
  assert.equal(removed.after, null);
  assert.equal(
    (
      await source.write(
        request("deleteChannelOverwrite", {
          channelId: ids.general,
          targetType: "role",
          targetId: ids.demon,
        }),
      )
    ).changed,
    false,
  );
});

test("inheriting a permission without an existing overwrite does not create an empty entry", async (t) => {
  const { source, mutations } = setup(t);
  const result = await source.write(
    request("setChannelOverwrite", {
      channelId: ids.general,
      targetType: "role",
      targetId: ids.demon,
      changes: [{ permission: "ViewChannel", value: "inherit" }],
    }),
  );
  assert.equal(result.changed, false);
  assert.equal(result.applied, false);
  assert.equal(mutations().length, 0);
});

test("overwrite tools reject foreign targets, duplicate flags and unavailable permissions", async (t) => {
  const { source, mutations } = setup(t);
  const input = request("setChannelOverwrite", {
    channelId: ids.general,
    targetType: "role",
    targetId: ids.demon,
    changes: [{ permission: "ViewChannel", value: "allow" }],
  });
  for (const action of [
    { ...input, channelId: "99999999999999999" },
    { ...input, targetId: "99999999999999999" },
    { ...input, targetType: "member", targetId: "99999999999999999" },
    {
      ...input,
      changes: [
        { permission: "ViewChannel", value: "allow" },
        { permission: "ViewChannel", value: "deny" },
      ],
    },
    { ...input, changes: [{ permission: "ManageRoles", value: "allow" }] },
    { ...input, changes: [{ permission: "BanMembers", value: "deny" }] },
  ])
    await assert.rejects(source.write(action));
  assert.equal(mutations().length, 0);
});

test("category overwrite previews identify synced children, while role hierarchy does not gate overwrites", async (t) => {
  const { source, state } = setup(t);
  state.roles.find((entry) => entry.id === ids.admin).position = 7;
  state.channels[2].permission_overwrites = structuredClone(
    state.channels[0].permission_overwrites,
  );
  const preview = await source.write(
    request("setChannelOverwrite", {
      channelId: ids.category,
      targetType: "role",
      targetId: ids.admin,
      changes: [{ permission: "ViewChannel", value: "allow" }],
      dryRun: true,
    }),
  );
  assert.deepEqual(preview.affectedSyncedChannelIds, [ids.general]);
});

test("per-server serialization preserves concurrent permission patches and survives a failed write", async (t) => {
  const { source, state } = setup(t);
  const failed = source.write(
    request("createRole", { name: "upstream-error" }),
  );
  const first = source.write(
    request("updateRole", {
      roleId: ids.smiters,
      grantPermissions: ["ViewChannel"],
    }),
  );
  const second = source.write(
    request("updateRole", {
      roleId: ids.smiters,
      grantPermissions: ["SendMessages"],
    }),
  );
  await assert.rejects(failed);
  await Promise.all([first, second]);
  assert.equal(
    state.roles.find((entry) => entry.id === ids.smiters).permissions,
    (P.ViewChannel | P.SendMessages).toString(),
  );
});
