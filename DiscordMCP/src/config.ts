import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

export class UserError extends Error {}

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const path =
    env.DISCORD_MCP_CONFIG ??
    fileURLToPath(new URL("../.env", import.meta.url));
  let local: Record<string, string> = {};
  try {
    local = parse(readFileSync(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new UserError("Cannot read the Discord MCP configuration file.");
    }
  }
  const settings = { ...local, ...env };
  let credentials: Record<string, string> = {};
  if (settings.DISCORD_ENV_FILE) {
    try {
      credentials = parse(readFileSync(settings.DISCORD_ENV_FILE));
    } catch {
      throw new UserError("Cannot read DISCORD_ENV_FILE.");
    }
  }
  const token =
    settings.DISCORD_BOT_TOKEN ||
    settings.DISCORD_TOKEN ||
    credentials.DISCORD_BOT_TOKEN ||
    credentials.DISCORD_TOKEN;
  if (!token?.trim())
    throw new UserError("Set DISCORD_BOT_TOKEN or DISCORD_ENV_FILE.");
  const guildIds = [
    ...new Set(
      (settings.DISCORD_ALLOWED_GUILDS ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
  if (!guildIds.length || guildIds.some((id) => !/^\d{17,20}$/.test(id))) {
    throw new UserError(
      "DISCORD_ALLOWED_GUILDS must contain explicit, comma-separated server IDs.",
    );
  }
  return { token: token.trim(), guildIds };
}

export function safeError(error: unknown): string {
  if (error instanceof UserError) return error.message;
  // Do not forward upstream exception messages, request bodies, headers, or tokens.
  const status = (error as { status?: number } | null)?.status;
  if (status === 401) return "Discord rejected the bot credentials.";
  if (status === 403)
    return "The bot does not have access to this Discord resource.";
  if (status === 404)
    return "Discord could not find this server, channel, or member.";
  if (status === 429)
    return "Discord rate limited this request. Try again shortly.";
  return "Discord inspection failed. Check local configuration and connectivity.";
}
