import { ChannelType, PermissionFlagsBits as P, REST } from "discord.js";
import * as z from "zod/v4";
import { UserError, type CommandApplication } from "./config.js";
import type { InspectorSource } from "./discord.js";
import { calculatePermissions, targetFromMember } from "./permissions.js";

const id = z
  .string()
  .regex(/^\d{17,20}$/, "Use a Discord ID with 17–20 digits.");
const scope = "applications.commands.permissions.update";
const permission = z.object({
  id,
  type: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  permission: z.boolean(),
});
const permissionRecord = z.object({
  id,
  application_id: id,
  guild_id: id,
  permissions: z.array(permission).max(100),
});
type Permission = z.infer<typeof permission>;
const target = { guildId: id, applicationId: id };
const write = {
  ...target,
  commandId: id.optional(),
  dryRun: z.boolean().default(false),
};
const value = z.enum(["allow", "deny", "inherit"]);
const change = z.discriminatedUnion("targetType", [
  z.object({ targetType: z.literal("allChannels"), value }).strict(),
  z
    .object({
      targetType: z.enum(["role", "member", "channel"]),
      targetId: id,
      value,
    })
    .strict(),
]);
export const commandSchemas = {
  applications: z.object({ guildId: id }).strict(),
  inspect: z.object(target).strict(),
  set: z
    .object({ ...write, changes: z.array(change).min(1).max(100) })
    .strict(),
  restrict: z
    .object({ ...write, channelIds: z.array(id).min(1).max(99) })
    .strict(),
};
const requestSchema = z.discriminatedUnion("action", [
  commandSchemas.applications.extend({ action: z.literal("applications") }),
  commandSchemas.inspect.extend({ action: z.literal("inspect") }),
  commandSchemas.set.extend({ action: z.literal("set") }),
  commandSchemas.restrict.extend({ action: z.literal("restrict") }),
]);
export type CommandRequest = z.infer<typeof requestSchema>;
export function parseCommandRequest(input: unknown): CommandRequest {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success)
    throw new UserError(
      "Invalid application command permission request. Check tool fields and Discord IDs.",
    );
  const result = parsed.data;
  if (
    result.action === "restrict" &&
    new Set(result.channelIds).size !== result.channelIds.length
  )
    throw new UserError("Do not repeat channel IDs.");
  if (result.action === "set") {
    const keys = result.changes.map((entry) =>
      entry.targetType === "allChannels"
        ? `3:${BigInt(result.guildId) - 1n}`
        : `${{ role: 1, member: 2, channel: 3 }[entry.targetType]}:${entry.targetId}`,
    );
    if (new Set(keys).size !== keys.length)
      throw new UserError("Do not repeat a permission target.");
  }
  return result;
}
const limits = [
  "Discord administrators can use all commands, including in restricted channels.",
  "Channel command permissions also apply to threads in that channel.",
  "Application defaults apply to commands without individual overrides; inspect individual command permission records before assuming all commands inherit them.",
  "These are server installation settings, not restrictions on direct messages or separate user-installed apps. Channel access and command default member permissions still apply.",
  "Discord checks the OAuth user's ability to run the command and manage affected resources when applying a change. A preview cannot guarantee acceptance or reserve the state.",
];
const restFor = (token: string, bearer = false) =>
  new REST({
    version: "10",
    timeout: 15_000,
    retries: 0,
    authPrefix: bearer ? "Bearer" : "Bot",
  }).setToken(token);
const key = (entry: Permission) => `${entry.type}:${entry.id}`;
const equal = (a: Permission[], b: Permission[]) =>
  JSON.stringify([...a].sort((a, b) => key(a).localeCompare(key(b)))) ===
  JSON.stringify([...b].sort((a, b) => key(a).localeCompare(key(b))));

export async function executeCommandRequest(
  source: InspectorSource,
  applications: CommandApplication[],
  input: CommandRequest,
): Promise<Record<string, unknown>> {
  if (!source.guildIds.includes(input.guildId))
    throw new UserError("This server is not in DISCORD_ALLOWED_GUILDS.");
  if (input.action === "applications")
    return {
      guildId: input.guildId,
      applications: applications.map((app) => ({
        applicationId: app.id,
        name: app.name,
        oauthConfigured: !!app.oauthToken,
      })),
      requiredOAuthScopes: [scope, "identify"],
      limitations: limits,
    };
  const app = applications.find((app) => app.id === input.applicationId);
  if (!app)
    throw new UserError(
      "This application is not configured for command permissions. Configure DISCORD_COMMAND_APPLICATIONS_FILE.",
    );
  const bot = restFor(app.botToken);
  const identity = (await bot.get("/oauth2/applications/@me")) as {
    id: string;
  };
  if (identity.id !== app.id)
    throw new UserError(
      "The configured bot credentials belong to a different application.",
    );
  const base =
    `/applications/${app.id}/guilds/${input.guildId}/commands` as const;
  const snapshot = await source.snapshot(input.guildId);
  // The target bot must itself have access to the selected server.
  await bot.get(`/guilds/${input.guildId}`);
  const [globals, guilds, rawRecords] = await Promise.all([
    bot.get(`/applications/${app.id}/commands`),
    bot.get(base),
    bot.get(`${base}/permissions`),
  ]);
  const commandSchema = z.object({
    id,
    application_id: id,
    guild_id: id.optional(),
    name: z.string(),
    type: z.number().int(),
    default_member_permissions: z.string().nullable().optional(),
  });
  const globalCommands = z.array(commandSchema).safeParse(globals);
  const guildCommands = z.array(commandSchema).safeParse(guilds);
  const parsedRecords = z.array(permissionRecord).safeParse(rawRecords);
  if (
    !globalCommands.success ||
    !guildCommands.success ||
    !parsedRecords.success
  )
    throw new UserError(
      "Discord returned an unsupported command permissions response.",
    );
  const records = parsedRecords.data;
  const commands = [
    ...globalCommands.data.map((c) => ({ ...c, scope: "global" })),
    ...guildCommands.data.map((c) => ({ ...c, scope: "guild" })),
  ];
  if (
    commands.some(
      (c) =>
        c.application_id !== app.id ||
        (c.guild_id !== undefined && c.guild_id !== input.guildId),
    ) ||
    records.some(
      (r) => r.application_id !== app.id || r.guild_id !== input.guildId,
    )
  )
    throw new UserError(
      "Discord returned command data for a different application or server.",
    );
  const meta = {
    guildId: input.guildId,
    application: { id: app.id, name: app.name },
    fetchedAt: new Date().toISOString(),
    limitations: limits,
  };
  const explicitCommandPermissionIds = records
    .filter((r) => r.id !== app.id)
    .map((r) => r.id);
  if (input.action === "inspect")
    return {
      ...meta,
      applicationPermissions: records.find((r) => r.id === app.id) ?? null,
      commands: commands.map((c) => ({
        ...c,
        permissionRecord: records.find((r) => r.id === c.id) ?? null,
      })),
      explicitCommandPermissionIds,
      oauthConfigured: !!app.oauthToken,
      requiredOAuthScopes: [scope, "identify"],
    };
  const commandId = input.commandId ?? app.id;
  if (
    commandId !== app.id &&
    !commands.some((command) => command.id === commandId)
  )
    throw new UserError(
      "This command does not belong to the configured application in this server or its global command list.",
    );
  const before = records.find((r) => r.id === commandId) ?? {
    id: commandId,
    application_id: app.id,
    guild_id: input.guildId,
    permissions: [],
  };
  if (new Set(before.permissions.map(key)).size !== before.permissions.length)
    throw new UserError(
      "Discord returned duplicate command permission targets.",
    );
  const allChannels = String(BigInt(input.guildId) - 1n);
  const changedChannels = new Set<string>();
  const channelById = (channelId: string) => {
    const channel = snapshot.channels.find((c) => c.id === channelId);
    if (!channel || channel.type === ChannelType.GuildCategory)
      throw new UserError(
        "Use a channel in this server, not a category or a thread.",
      );
    changedChannels.add(channelId);
    return channel;
  };
  let proposedPermissions: Permission[];
  if (input.action === "restrict") {
    input.channelIds.forEach(channelById);
    // Replace channel entries deliberately, preserving every role/user entry.
    proposedPermissions = [
      ...before.permissions.filter((p) => p.type !== 3),
      { id: allChannels, type: 3, permission: false },
      ...input.channelIds.map((id) => ({
        id,
        type: 3 as const,
        permission: true,
      })),
    ];
  } else {
    proposedPermissions = before.permissions.map((p) => ({ ...p }));
    for (const entry of input.changes) {
      const type =
        entry.targetType === "allChannels"
          ? 3
          : ({ role: 1, member: 2, channel: 3 } as const)[entry.targetType];
      const targetId =
        entry.targetType === "allChannels" ? allChannels : entry.targetId;
      if (entry.targetType === "channel") channelById(targetId);
      if (
        entry.targetType === "role" &&
        !snapshot.roles.some((role) => role.id === targetId)
      )
        throw new UserError(
          "This role does not belong to the selected server.",
        );
      if (entry.targetType === "member")
        await source.member(input.guildId, targetId);
      proposedPermissions = proposedPermissions.filter(
        (p) => key(p) !== `${type}:${targetId}`,
      );
      if (entry.value !== "inherit")
        proposedPermissions.push({
          id: targetId,
          type,
          permission: entry.value === "allow",
        });
    }
  }
  if (proposedPermissions.length > 100)
    throw new UserError(
      "Discord allows at most 100 permission entries per application or command. Reduce the target list.",
    );
  const proposed = { ...before, permissions: proposedPermissions };
  const authorization = {
    configured: !!app.oauthToken,
    verified: false,
    requiredScopes: [scope, "identify"],
  };
  if (!app.oauthToken && !input.dryRun)
    throw new UserError(
      "Command permission writes require a user-authorized OAuth token for this application with applications.commands.permissions.update and identify. Bot tokens cannot be used. Configure its oauthEnvFile and reconnect.",
    );
  let oauth: REST | undefined;
  if (app.oauthToken) {
    oauth = restFor(app.oauthToken, true);
    try {
      const auth = (await oauth.get("/oauth2/@me")) as {
        application?: { id?: string };
        user?: { id?: string };
        scopes?: string[];
        expires?: string;
      };
      if (
        auth.application?.id !== app.id ||
        !auth.scopes?.includes(scope) ||
        !auth.scopes.includes("identify") ||
        !auth.user?.id ||
        !/^\d{17,20}$/.test(auth.user.id) ||
        !auth.expires ||
        !(Date.parse(auth.expires) > Date.now())
      )
        throw new UserError(
          "The OAuth authorization is expired, belongs to another application, or lacks the required user, identify scope, or command permissions scope. Reauthorize this application.",
        );
      const actor = await source.member(input.guildId, auth.user.id);
      const target = targetFromMember(auth.user.id, actor);
      const bits = BigInt(
        calculatePermissions(snapshot, target).rawPermissions,
      );
      if (
        (bits & (P.ManageGuild | P.ManageRoles)) !==
        (P.ManageGuild | P.ManageRoles)
      )
        throw new UserError(
          "The authorized user needs Manage Server and Manage Roles in this server.",
        );
      const affectsAllChannels =
        input.action === "restrict" ||
        (input.action === "set" &&
          input.changes.some((c) => c.targetType === "allChannels"));
      const channelsToCheck = affectsAllChannels
        ? snapshot.channels.filter((c) => c.type !== ChannelType.GuildCategory)
        : snapshot.channels.filter((c) => changedChannels.has(c.id));
      for (const channel of channelsToCheck) {
        const permission = calculatePermissions(snapshot, target, channel);
        if (
          !permission.capabilities.viewChannel ||
          !(BigInt(permission.rawPermissions) & P.ManageChannels)
        )
          throw new UserError(
            "The authorized user needs View Channel and Manage Channels for affected channels.",
          );
      }
      authorization.verified = true;
    } catch (error) {
      if (error instanceof UserError) throw error;
      throw new UserError(
        "Could not verify this application's OAuth authorization. Check its expiry, scope, and authorized user's server access; reconnect after updating credentials.",
      );
    }
  }
  const changed = !equal(before.permissions, proposedPermissions);
  let after = before;
  if (!input.dryRun && changed) {
    try {
      const response = permissionRecord.safeParse(
        await oauth!.put(`${base}/${commandId}/permissions`, {
          body: { permissions: proposedPermissions },
        }),
      );
      if (
        !response.success ||
        response.data.id !== commandId ||
        response.data.application_id !== app.id ||
        response.data.guild_id !== input.guildId
      )
        throw new Error();
      after = response.data;
    } catch {
      throw new UserError(
        "Discord did not confirm the command permission update. Inspect current permissions before retrying; check the OAuth user's permissions and ability to run this command.",
      );
    }
  }
  return {
    ...meta,
    commandId,
    scope: commandId === app.id ? "applicationDefaults" : "command",
    dryRun: input.dryRun,
    changed,
    applied: !input.dryRun && changed,
    authorization,
    before,
    proposed,
    after: input.dryRun ? null : after,
    explicitCommandPermissionIds,
  };
}
