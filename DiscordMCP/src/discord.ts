import {
  REST,
  Routes,
  type APIGuild,
  type APIGuildChannel,
  type APIGuildMember,
  type APIRole,
} from "discord.js";
import { UserError } from "./config.js";
import type { Snapshot } from "./permissions.js";

export interface InspectorSource {
  guildIds: string[];
  snapshot(guildId: string): Promise<Snapshot>;
  member(guildId: string, memberId: string): Promise<APIGuildMember>;
}

export function createSource(
  token: string,
  guildIds: string[],
): InspectorSource {
  const rest = new REST({
    version: "10",
    timeout: 15_000,
    retries: 1,
  }).setToken(token);
  const allowed = new Set(guildIds);
  function assertAllowed(guildId: string) {
    if (!allowed.has(guildId))
      throw new UserError("This server is not in DISCORD_ALLOWED_GUILDS.");
  }
  return {
    guildIds: [...allowed],
    async snapshot(guildId) {
      assertAllowed(guildId);
      // GET requests only. No gateway login, message access, or bot restart.
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
  };
}
