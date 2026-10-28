import {
  REST,
  Routes,
  type APIGuild,
  type APIGuildChannel,
  type APIGuildMember,
  type APIRole,
} from "discord.js";
import { UserError, type CommandApplication } from "./config.js";
import type { Snapshot } from "./permissions.js";
import { executeWrite, parseWrite } from "./writes.js";
import {
  executeCommandRequest,
  parseCommandRequest,
} from "./command-permissions.js";

export interface InspectorSource {
  guildIds: string[];
  snapshot(guildId: string): Promise<Snapshot>;
  member(guildId: string, memberId: string): Promise<APIGuildMember>;
  write(input: unknown): Promise<Record<string, unknown>>;
  commands(input: unknown): Promise<Record<string, unknown>>;
}

export function createSource(
  token: string,
  guildIds: string[],
  applications: CommandApplication[] = [],
): InspectorSource {
  const rest = new REST({
    version: "10",
    timeout: 15_000,
    // Never retry an ambiguous server error that could duplicate a creation.
    retries: 0,
  }).setToken(token);
  const allowed = new Set(guildIds);
  function assertAllowed(guildId: string) {
    if (!allowed.has(guildId))
      throw new UserError("This server is not in DISCORD_ALLOWED_GUILDS.");
  }
  const pending = new Map<string, Promise<unknown>>();
  async function serialize<T>(
    guildId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const previous = pending.get(guildId) ?? Promise.resolve();
    const task = previous.catch(() => {}).then(fn);
    pending.set(guildId, task);
    try {
      return await task;
    } finally {
      if (pending.get(guildId) === task) pending.delete(guildId);
    }
  }
  const source: InspectorSource = {
    guildIds: [...allowed],
    async snapshot(guildId) {
      assertAllowed(guildId);
      // Inspection stays GET-only; writes have their own guarded path.
      const [guild, roles, channels] = await Promise.all([
        rest.get(Routes.guild(guildId)) as Promise<APIGuild>,
        rest.get(Routes.guildRoles(guildId)) as Promise<APIRole[]>,
        rest.get(Routes.guildChannels(guildId)) as Promise<APIGuildChannel[]>,
      ]);
      return { guild, roles, channels, fetchedAt: new Date().toISOString() };
    },
    async member(guildId, memberId) {
      assertAllowed(guildId);
      return rest.get(
        Routes.guildMember(guildId, memberId),
      ) as Promise<APIGuildMember>;
    },
    async write(input) {
      const parsed = parseWrite(input);
      assertAllowed(parsed.guildId);
      // Serialize this process's changes per server so permission patches do
      // not overwrite each other using simultaneously fetched snapshots.
      return serialize(parsed.guildId, () =>
        executeWrite(source, rest, parsed),
      );
    },
    async commands(input) {
      const parsed = parseCommandRequest(input);
      assertAllowed(parsed.guildId);
      const execute = () => executeCommandRequest(source, applications, parsed);
      return parsed.action === "set" || parsed.action === "restrict"
        ? serialize(parsed.guildId, execute)
        : execute();
    },
  };
  return source;
}
