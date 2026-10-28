import {
  ChannelType,
  PermissionFlagsBits as P,
  Routes,
  type APIGuildChannel,
  type APIRole,
  type APIUser,
  type REST,
} from "discord.js";
import * as z from "zod/v4";
import { UserError } from "./config.js";
import type { InspectorSource } from "./discord.js";
import {
  calculatePermissions,
  normalizedOverwrites,
  targetFromMember,
  type Snapshot,
} from "./permissions.js";

const id = z
  .string()
  .regex(/^\d{17,20}$/, "Use a Discord ID with 17–20 digits.");
const permission = z.enum(
  Object.keys(P) as [keyof typeof P, ...(keyof typeof P)[]],
);
const permissions = z.array(permission).max(Object.keys(P).length);
const common = {
  guildId: id,
  dryRun: z
    .boolean()
    .default(false)
    .describe("Preview the change without writing to Discord."),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(512)
    .optional()
    .describe("Discord audit log reason."),
};
const roleFields = {
  name: z.string().trim().min(1).max(100).optional(),
  color: z.number().int().min(0).max(0xffffff).optional(),
  hoist: z.boolean().optional(),
  mentionable: z.boolean().optional(),
};
const channelFields = {
  name: z.string().trim().min(1).max(100).optional(),
  topic: z.string().max(4096).nullable().optional(),
  nsfw: z.boolean().optional(),
  slowmodeSeconds: z.number().int().min(0).max(21600).optional(),
  parentId: id.nullable().optional(),
};
const overwriteTarget = {
  channelId: id,
  targetId: id,
  targetType: z.enum(["role", "member"]),
};

export const writeSchemas = {
  createRole: z
    .object({
      ...common,
      ...roleFields,
      name: z.string().trim().min(1).max(100),
      permissions: permissions.default([]),
    })
    .strict(),
  updateRole: z
    .object({
      ...common,
      ...roleFields,
      roleId: id,
      grantPermissions: permissions.default([]),
      revokePermissions: permissions.default([]),
    })
    .strict(),
  setMemberRole: z
    .object({ ...common, memberId: id, roleId: id, assigned: z.boolean() })
    .strict(),
  createChannel: z
    .object({
      ...common,
      ...channelFields,
      name: z.string().trim().min(1).max(100),
      type: z.enum(["text", "voice", "category"]).default("text"),
    })
    .strict(),
  updateChannel: z
    .object({ ...common, ...channelFields, channelId: id })
    .strict(),
  setChannelOverwrite: z
    .object({
      ...common,
      ...overwriteTarget,
      changes: z
        .array(
          z
            .object({ permission, value: z.enum(["allow", "deny", "inherit"]) })
            .strict(),
        )
        .min(1)
        .max(Object.keys(P).length),
    })
    .strict(),
  deleteChannelOverwrite: z.object({ ...common, ...overwriteTarget }).strict(),
};

const writeSchema = z.discriminatedUnion("action", [
  writeSchemas.createRole.extend({ action: z.literal("createRole") }),
  writeSchemas.updateRole.extend({ action: z.literal("updateRole") }),
  writeSchemas.setMemberRole.extend({ action: z.literal("setMemberRole") }),
  writeSchemas.createChannel.extend({ action: z.literal("createChannel") }),
  writeSchemas.updateChannel.extend({ action: z.literal("updateChannel") }),
  writeSchemas.setChannelOverwrite.extend({
    action: z.literal("setChannelOverwrite"),
  }),
  writeSchemas.deleteChannelOverwrite.extend({
    action: z.literal("deleteChannelOverwrite"),
  }),
]);
export type WriteInput = z.infer<typeof writeSchema>;

export function parseWrite(input: unknown): WriteInput {
  const parsed = writeSchema.safeParse(input);
  if (!parsed.success)
    throw new UserError(
      "Invalid Discord write request. Check tool fields and permission names.",
    );
  return parsed.data;
}

function channelById(snapshot: Snapshot, channelId: string) {
  const channel = snapshot.channels.find((entry) => entry.id === channelId);
  if (!channel)
    throw new UserError(
      "This channel does not belong to the selected server (threads are not supported).",
    );
  return channel;
}

function roleById(snapshot: Snapshot, roleId: string) {
  const role = snapshot.roles.find((entry) => entry.id === roleId);
  if (!role)
    throw new UserError("This role does not belong to the selected server.");
  return role;
}

const mask = (names: (keyof typeof P)[]) =>
  names.reduce((bits, name) => bits | P[name], 0n);
const compareRoles = (a: APIRole, b: APIRole) =>
  a.position - b.position || Number(BigInt(b.id) - BigInt(a.id));
const roleView = (role: APIRole) => ({
  id: role.id,
  name: role.name,
  permissions: role.permissions,
  color: role.colors?.primary_color ?? role.color,
  hoist: role.hoist,
  mentionable: role.mentionable,
});
const channelView = (channel: APIGuildChannel) => ({
  id: channel.id,
  name: channel.name,
  type: channel.type,
  parentId: channel.parent_id ?? null,
  topic: "topic" in channel ? channel.topic : null,
  nsfw: channel.nsfw ?? false,
  slowmodeSeconds:
    "rate_limit_per_user" in channel ? (channel.rate_limit_per_user ?? 0) : 0,
});

// This is the only write path. Every action validates scope and fetches fresh
// bot permissions before building one narrowly scoped Discord REST request.
export async function executeWrite(
  source: InspectorSource,
  rest: REST,
  input: WriteInput,
): Promise<Record<string, unknown>> {
  if (!source.guildIds.includes(input.guildId))
    throw new UserError("This server is not in DISCORD_ALLOWED_GUILDS.");
  const snapshot = await source.snapshot(input.guildId);
  const bot = (await rest.get(Routes.user("@me"))) as APIUser;
  const member = await source.member(input.guildId, bot.id);
  const target = targetFromMember(bot.id, member);
  const serverPermissions = calculatePermissions(snapshot, target);
  const serverBits = BigInt(serverPermissions.rawPermissions);
  const requirePermission = (flag: bigint, channel?: APIGuildChannel) => {
    const result = calculatePermissions(snapshot, target, channel);
    if (
      (BigInt(result.rawPermissions) & flag) !== flag ||
      (channel && !result.capabilities.viewChannel)
    ) {
      throw new UserError(
        `The bot needs ${flag === P.ManageRoles ? "Manage Roles" : "Manage Channels"}${channel ? " and View Channel in this channel" : " in this server"}.`,
      );
    }
  };
  const assertGrantable = (bits: bigint) => {
    if (!serverPermissions.administrator && (bits & ~serverBits) !== 0n)
      throw new UserError("The bot cannot grant permissions it does not have.");
  };
  const assertEditableRole = (role: APIRole) => {
    if (role.managed)
      throw new UserError(
        "Managed integration and bot roles cannot be edited or assigned by this tool.",
      );
    if (role.id === snapshot.guild.id) return;
    const highest = snapshot.roles
      .filter(
        (entry) =>
          entry.id === snapshot.guild.id || member.roles.includes(entry.id),
      )
      .reduce((top, entry) => (compareRoles(entry, top) > 0 ? entry : top));
    if (compareRoles(role, highest) >= 0)
      throw new UserError(
        "The target role must be below the bot's highest role, including when the bot has Administrator.",
      );
  };

  let method: "post" | "patch" | "put" | "delete";
  let route: `/${string}`;
  let body: Record<string, unknown> | undefined;
  let before: unknown = null;
  let proposed: unknown;
  let responseKind: "role" | "channel" | "none" = "none";
  let changed = true;
  let affectedSyncedChannelIds: string[] = [];

  if (input.action === "createRole" || input.action === "updateRole") {
    requirePermission(P.ManageRoles);
    body = {};
    for (const key of ["name", "hoist", "mentionable"] as const)
      if (input[key] !== undefined) body[key] = input[key];
    if (input.color !== undefined)
      body.colors = {
        primary_color: input.color,
        secondary_color: null,
        tertiary_color: null,
      };
    if (input.action === "createRole") {
      const bits = mask(input.permissions);
      assertGrantable(bits);
      body.permissions = bits.toString();
      method = "post";
      route = Routes.guildRoles(input.guildId);
    } else {
      const role = roleById(snapshot, input.roleId);
      assertEditableRole(role);
      if (role.id === input.guildId && Object.keys(body).length)
        throw new UserError("Only permissions can be changed on @everyone.");
      const grant = mask(input.grantPermissions),
        revoke = mask(input.revokePermissions);
      if ((grant & revoke) !== 0n)
        throw new UserError("A permission cannot be both granted and revoked.");
      if (grant || revoke) {
        const bits = (BigInt(role.permissions) | grant) & ~revoke;
        assertGrantable(bits & ~BigInt(role.permissions));
        body.permissions = bits.toString();
      }
      if (!Object.keys(body).length)
        throw new UserError("Supply at least one role change.");
      before = roleView(role);
      method = "patch";
      route = Routes.guildRole(input.guildId, input.roleId);
    }
    proposed = body;
    responseKind = "role";
  } else if (input.action === "setMemberRole") {
    requirePermission(P.ManageRoles);
    const role = roleById(snapshot, input.roleId);
    assertEditableRole(role);
    if (role.id === input.guildId)
      throw new UserError(
        "@everyone is implicit and cannot be assigned or removed.",
      );
    const targetMember = await source.member(input.guildId, input.memberId);
    const assigned = targetMember.roles.includes(role.id);
    before = { memberId: input.memberId, roleId: role.id, assigned };
    proposed = {
      memberId: input.memberId,
      roleId: role.id,
      assigned: input.assigned,
    };
    changed = assigned !== input.assigned;
    method = input.assigned ? "put" : "delete";
    route = Routes.guildMemberRole(input.guildId, input.memberId, input.roleId);
  } else if (
    input.action === "createChannel" ||
    input.action === "updateChannel"
  ) {
    const channel =
      input.action === "updateChannel"
        ? channelById(snapshot, input.channelId)
        : undefined;
    const type =
      channel?.type ??
      (
        {
          text: ChannelType.GuildText,
          voice: ChannelType.GuildVoice,
          category: ChannelType.GuildCategory,
        } as const
      )[input.action === "createChannel" ? input.type : "text"];
    requirePermission(P.ManageChannels, channel);
    const parent = input.parentId
      ? channelById(snapshot, input.parentId)
      : undefined;
    if (parent) {
      if (parent.type !== ChannelType.GuildCategory)
        throw new UserError(
          "parentId must identify a category in this server.",
        );
      requirePermission(P.ManageChannels, parent);
    }
    if (type === ChannelType.GuildCategory && input.parentId)
      throw new UserError("Categories cannot have a parent category.");
    if (
      input.topic !== undefined &&
      ![
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
        ChannelType.GuildForum,
        ChannelType.GuildMedia,
      ].includes(type)
    )
      throw new UserError("This channel type does not support a topic.");
    if (
      input.topic &&
      input.topic.length >
        (type === ChannelType.GuildForum || type === ChannelType.GuildMedia
          ? 4096
          : 1024)
    )
      throw new UserError("This channel's topic is too long.");
    if (
      type === ChannelType.GuildCategory &&
      (input.nsfw !== undefined || input.slowmodeSeconds !== undefined)
    )
      throw new UserError(
        "Categories do not support NSFW or slowmode settings.",
      );
    body = {};
    for (const key of ["name", "topic", "nsfw"] as const)
      if (input[key] !== undefined) body[key] = input[key];
    if (input.slowmodeSeconds !== undefined)
      body.rate_limit_per_user = input.slowmodeSeconds;
    if (input.parentId !== undefined) body.parent_id = input.parentId;
    if (input.action === "createChannel") {
      body.type = type;
      method = "post";
      route = Routes.guildChannels(input.guildId);
    } else {
      if (!Object.keys(body).length)
        throw new UserError("Supply at least one channel change.");
      before = channelView(channel!);
      method = "patch";
      route = Routes.channel(input.channelId);
    }
    proposed = body;
    responseKind = "channel";
  } else {
    const channel = channelById(snapshot, input.channelId);
    requirePermission(P.ManageRoles, channel);
    const type = input.targetType === "role" ? 0 : 1;
    if (type === 0) roleById(snapshot, input.targetId);
    else await source.member(input.guildId, input.targetId);
    const existing = channel.permission_overwrites?.find(
      (entry) => entry.id === input.targetId && entry.type === type,
    );
    before = existing ?? null;
    route = Routes.channelPermission(input.channelId, input.targetId);
    if (channel.type === ChannelType.GuildCategory) {
      affectedSyncedChannelIds = snapshot.channels
        .filter(
          (child) =>
            child.parent_id === channel.id &&
            JSON.stringify(normalizedOverwrites(child)) ===
              JSON.stringify(normalizedOverwrites(channel)),
        )
        .map((child) => child.id);
    }
    if (input.action === "deleteChannelOverwrite") {
      proposed = null;
      changed = Boolean(existing);
      method = "delete";
    } else {
      let allow = BigInt(existing?.allow ?? "0"),
        deny = BigInt(existing?.deny ?? "0"),
        touched = 0n;
      for (const change of input.changes) {
        const bit = P[change.permission];
        if (touched & bit)
          throw new UserError(
            "Supply each permission only once, including aliases.",
          );
        touched |= bit;
        allow &= ~bit;
        deny &= ~bit;
        if (change.value === "allow") allow |= bit;
        if (change.value === "deny") deny |= bit;
      }
      const modified =
        (allow ^ BigInt(existing?.allow ?? "0")) |
        (deny ^ BigInt(existing?.deny ?? "0"));
      if (!serverPermissions.administrator && (modified & P.ManageRoles) !== 0n)
        throw new UserError(
          "Only a server administrator can change Manage Roles in a channel overwrite.",
        );
      const explicitManageRoles = channel.permission_overwrites?.some(
        (entry) =>
          ((entry.type === 0 &&
            (entry.id === input.guildId || member.roles.includes(entry.id))) ||
            (entry.type === 1 && entry.id === bot.id)) &&
          (BigInt(entry.allow) & P.ManageRoles) !== 0n,
      );
      const parentBits = channel.parent_id
        ? BigInt(
            calculatePermissions(
              snapshot,
              target,
              channelById(snapshot, channel.parent_id),
            ).rawPermissions,
          )
        : 0n;
      if (
        !serverPermissions.administrator &&
        !explicitManageRoles &&
        (modified & ~(serverBits | parentBits)) !== 0n
      )
        throw new UserError(
          "The bot cannot change overwrite permissions it does not have in the server or parent category.",
        );
      body = { type, allow: allow.toString(), deny: deny.toString() };
      proposed = { id: input.targetId, ...body };
      changed = modified !== 0n;
      method = "put";
    }
  }

  let after: unknown = null;
  const reason = input.reason ?? `Discord MCP: ${input.action}`;
  if (!input.dryRun && changed) {
    const response = await rest[method](route, {
      ...(body ? { body } : {}),
      reason,
    });
    after =
      responseKind === "role"
        ? roleView(response as APIRole)
        : responseKind === "channel"
          ? channelView(response as APIGuildChannel)
          : proposed;
  }
  return {
    action: input.action,
    dryRun: input.dryRun,
    applied: !input.dryRun && changed,
    changed,
    server: { id: snapshot.guild.id, name: snapshot.guild.name },
    before,
    proposed,
    after,
    reason,
    affectedSyncedChannelIds,
  };
}
