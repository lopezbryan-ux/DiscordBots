import assert from "node:assert/strict";
import test from "node:test";
import {
  ChannelType,
  Collection,
  GuildChannel,
  PermissionFlagsBits as P,
  PermissionsBitField,
} from "discord.js";
import {
  calculatePermissions as calculate,
  describeChannel,
  describeTarget,
  targetFromMember,
} from "../dist/permissions.js";
import { fixture, ids, overwrite } from "./fixture.mjs";

test("@everyone sees entrance only; Demon opens general; Smiters adds no access", () => {
  const s = fixture();
  const entrance = s.channels[1],
    general = s.channels[2];
  assert.equal(
    calculate(s, { roleIds: [] }, entrance).capabilities.viewChannel,
    true,
  );
  assert.equal(
    calculate(s, { roleIds: [] }, general).capabilities.viewChannel,
    false,
  );
  assert.equal(
    calculate(s, { roleIds: [ids.demon] }, general).capabilities.sendMessages,
    true,
  );
  assert.deepEqual(
    calculate(s, { roleIds: [ids.demon] }, general).capabilities,
    calculate(s, { roleIds: [ids.demon, ids.smiters] }, general).capabilities,
  );
});

test("role allow wins combined role deny regardless of hierarchy or order", () => {
  const s = fixture(),
    c = s.channels[2];
  c.permission_overwrites = [
    overwrite(ids.guild, 0n, P.ViewChannel),
    overwrite(ids.demon, P.ViewChannel),
    overwrite(ids.deny, 0n, P.ViewChannel),
  ];
  for (const roleIds of [
    [ids.demon, ids.deny],
    [ids.deny, ids.demon],
  ]) {
    assert.equal(calculate(s, { roleIds }, c).capabilities.viewChannel, true);
  }
});

test("member overwrite is last and is absent in hypothetical role previews", () => {
  const s = fixture(),
    c = s.channels[2];
  c.permission_overwrites = [overwrite(ids.member, 0n, P.ViewChannel, 1)];
  assert.equal(
    calculate(s, { roleIds: [ids.demon] }, c).capabilities.viewChannel,
    true,
  );
  const r = calculate(s, { roleIds: [ids.demon], memberId: ids.member }, c);
  assert.equal(r.capabilities.viewChannel, false);
  assert.equal(r.trace.at(-1).stage, "member_channel_overwrite");
  c.permission_overwrites = [overwrite(ids.member, P.ViewChannel, 0n, 1)];
  assert.equal(
    calculate(s, { roleIds: [], memberId: ids.member }, c).capabilities
      .viewChannel,
    true,
  );
});

test("owner and Administrator bypass all channel denies", () => {
  const s = fixture(),
    c = s.channels[2];
  c.permission_overwrites = [
    overwrite(ids.guild, 0n, PermissionsBitField.All),
    overwrite(ids.owner, 0n, PermissionsBitField.All, 1),
  ];
  const admin = calculate(s, { roleIds: [ids.admin] }, c);
  assert.equal(admin.administrator, true);
  assert.equal(admin.capabilities.viewChannel, true);
  const owner = calculate(s, { roleIds: [], memberId: ids.owner }, c);
  assert.equal(owner.owner, true);
  assert.equal(owner.capabilities.sendMessages, true);
});

test("hidden channels cannot be used even with raw send/read flags", () => {
  const s = fixture(),
    r = calculate(s, { roleIds: [] }, s.channels[2]);
  assert.ok(r.permissionNames.includes("SendMessages"));
  assert.equal(r.capabilities.sendMessages, false);
  assert.equal(r.capabilities.readMessageHistory, false);
  assert.equal(r.capabilities.useApplicationCommands, false);
});

test("Send Messages denial implicitly blocks attachments, embeds, and mentions", () => {
  const s = fixture(),
    c = s.channels[2];
  c.permission_overwrites = [overwrite(ids.guild, 0n, P.SendMessages)];
  const r = calculate(s, { roleIds: [ids.demon] }, c);
  assert.equal(r.capabilities.viewChannel, true);
  assert.ok(r.permissionNames.includes("AttachFiles"));
  for (const key of [
    "sendMessages",
    "attachFiles",
    "embedLinks",
    "mentionEveryone",
  ])
    assert.equal(r.capabilities[key], false);
});

test("unsynced child uses its own overwrites rather than its category", () => {
  const s = fixture(),
    c = s.channels[2];
  assert.equal(describeChannel(s, c).permissionsSyncedWithCategory, false);
  assert.equal(
    calculate(s, { roleIds: [ids.demon] }, c).capabilities.viewChannel,
    true,
  );
  c.permission_overwrites = [overwrite(ids.guild, 0n, P.ViewChannel)];
  assert.equal(describeChannel(s, c).permissionsSyncedWithCategory, true);
  assert.equal(
    calculate(s, { roleIds: [ids.demon] }, c).capabilities.viewChannel,
    false,
  );
});

test("timeout suppresses interaction while preserving existing View/History; expired timeout does not", () => {
  const s = fixture(),
    c = s.channels[1];
  const target = targetFromMember(ids.member, {
    roles: [ids.demon],
    communication_disabled_until: "2999-01-01T00:00:00Z",
  });
  const r = calculate(s, target, c);
  assert.equal(r.timedOut, true);
  assert.equal(r.capabilities.readMessageHistory, true);
  assert.equal(r.capabilities.sendMessages, false);
  assert.equal(r.capabilities.useApplicationCommands, false);
  target.timeoutUntil = "2000-01-01T00:00:00Z";
  assert.equal(calculate(s, target, c).capabilities.sendMessages, true);
});

test("voice and forum capabilities are distinguished from ordinary text", () => {
  const s = fixture(),
    c = s.channels[2];
  s.roles[1].permissions = (P.ViewChannel | P.Speak).toString();
  c.type = ChannelType.GuildVoice;
  assert.equal(
    calculate(s, { roleIds: [ids.demon] }, c).capabilities.speakPermission,
    false,
  );
  s.roles[1].permissions = (P.ViewChannel | P.Speak | P.Connect).toString();
  assert.equal(
    calculate(s, { roleIds: [ids.demon] }, c).capabilities.speakPermission,
    true,
  );
  c.type = ChannelType.GuildForum;
  const r = calculate(s, { roleIds: [ids.demon] }, c);
  assert.equal(r.capabilities.sendMessages, null);
  assert.equal(r.capabilities.createForumPosts, true);
});

test("unknown roles fail; duplicate roles are counted once", () => {
  const s = fixture();
  assert.throws(
    () => describeTarget(s, { roleIds: ["99999999999999999"] }),
    /does not belong/,
  );
  assert.equal(
    describeTarget(s, { roleIds: [ids.guild, ids.demon, ids.demon] }).roles
      .length,
    2,
  );
});

test("raw overwrite calculation agrees with discord.js across 100 deterministic combinations", () => {
  const flags = [
    P.ViewChannel,
    P.SendMessages,
    P.ReadMessageHistory,
    P.AttachFiles,
    P.Connect,
    P.Speak,
  ];
  let seed = 123456;
  const mask = () =>
    flags.reduce((bits, flag) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % 3 ? bits | flag : bits;
    }, 0n);
  for (let i = 0; i < 100; i++) {
    const s = fixture(),
      c = s.channels[2];
    s.roles[0].permissions = mask().toString();
    s.roles[1].permissions = mask().toString();
    c.permission_overwrites = [
      overwrite(ids.guild, mask(), mask()),
      overwrite(ids.demon, mask(), mask()),
      overwrite(ids.deny, mask(), mask()),
      overwrite(ids.member, mask(), mask(), 1),
    ];
    const roles = new Collection(
      s.roles
        .filter((r) => [ids.guild, ids.demon, ids.deny].includes(r.id))
        .map((r) => [
          r.id,
          { ...r, permissions: new PermissionsBitField(r.permissions) },
        ]),
    );
    const receiver = {
      guild: { id: ids.guild, ownerId: ids.owner },
      permissionOverwrites: {
        cache: new Collection(
          c.permission_overwrites.map((o) => [
            o.id,
            {
              ...o,
              allow: new PermissionsBitField(o.allow),
              deny: new PermissionsBitField(o.deny),
            },
          ]),
        ),
      },
      overwritesFor: GuildChannel.prototype.overwritesFor,
    };
    const expected = GuildChannel.prototype.memberPermissions.call(
      receiver,
      { id: ids.member, roles: { cache: roles } },
      true,
    ).bitfield;
    const actual = calculate(
      s,
      { memberId: ids.member, roleIds: [ids.demon, ids.deny] },
      c,
    );
    assert.equal(BigInt(actual.rawPermissions), expected, `combination ${i}`);
  }
});
