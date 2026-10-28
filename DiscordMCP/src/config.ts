import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parse } from "dotenv";

export class UserError extends Error {}

export interface CommandApplication {
  id: string;
  name: string;
  botToken: string;
  oauthToken?: string;
}

function commandApplications(
  settings: Record<string, string | undefined>,
  configPath: string,
  defaultToken: string,
  defaultId?: string,
): CommandApplication[] {
  const applications: CommandApplication[] = [];
  if (settings.DISCORD_COMMAND_APPLICATIONS_FILE) {
    try {
      const path = resolve(
        dirname(configPath),
        settings.DISCORD_COMMAND_APPLICATIONS_FILE,
      );
      const entries: unknown = JSON.parse(readFileSync(path, "utf8"));
      if (!Array.isArray(entries)) throw new Error();
      for (const entry of entries) {
        if (
          !entry ||
          typeof entry !== "object" ||
          Object.keys(entry).some(
            (key) =>
              !["applicationId", "name", "botEnvFile", "oauthEnvFile"].includes(
                key,
              ),
          ) ||
          typeof entry.applicationId !== "string" ||
          !/^\d{17,20}$/.test(entry.applicationId) ||
          typeof entry.botEnvFile !== "string" ||
          !entry.botEnvFile.trim() ||
          (entry.name !== undefined &&
            (typeof entry.name !== "string" || !entry.name.trim())) ||
          (entry.oauthEnvFile !== undefined &&
            (typeof entry.oauthEnvFile !== "string" ||
              !entry.oauthEnvFile.trim())) ||
          applications.some((app) => app.id === entry.applicationId)
        )
          throw new Error();
        const credentials = parse(
          readFileSync(resolve(dirname(path), entry.botEnvFile)),
        );
        const botToken =
          credentials.DISCORD_BOT_TOKEN || credentials.DISCORD_TOKEN;
        if (
          !botToken?.trim() ||
          (credentials.CLIENT_ID &&
            credentials.CLIENT_ID !== entry.applicationId)
        )
          throw new Error();
        let oauthToken: string | undefined;
        if (entry.oauthEnvFile) {
          try {
            oauthToken =
              parse(
                readFileSync(resolve(dirname(path), entry.oauthEnvFile)),
              ).DISCORD_OAUTH_ACCESS_TOKEN?.trim() || undefined;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
        }
        applications.push({
          id: entry.applicationId,
          name: entry.name?.trim() || entry.applicationId,
          botToken: botToken.trim(),
          oauthToken,
        });
      }
    } catch {
      throw new UserError(
        "Cannot load DISCORD_COMMAND_APPLICATIONS_FILE. Check its application IDs, unique entries, and credential file settings.",
      );
    }
  }
  if (
    defaultId &&
    /^\d{17,20}$/.test(defaultId) &&
    !applications.some((app) => app.id === defaultId)
  ) {
    applications.push({
      id: defaultId,
      name: "Default MCP application",
      botToken: defaultToken,
    });
  }
  return applications;
}

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
  return {
    token: token.trim(),
    guildIds,
    applications: commandApplications(
      settings,
      path,
      token.trim(),
      settings.DISCORD_APPLICATION_ID || credentials.CLIENT_ID,
    ),
  };
}

export function safeError(error: unknown): string {
  if (error instanceof UserError) return error.message;
  // Do not forward upstream exception messages, request bodies, headers, or tokens.
  const status = (error as { status?: number } | null)?.status;
  if (status === 401) return "Discord rejected the bot credentials.";
  if (status === 403)
    return "The bot does not have access to this Discord resource.";
  if (status === 404)
    return "Discord could not find this server, channel, role, or member.";
  if (status === 429)
    return "Discord rate limited this request. Try again shortly.";
  if (status === 400)
    return "Discord rejected this request. Check its fields and the bot's permissions.";
  return "Discord request failed. Check local configuration and connectivity; inspect the resource before retrying a write.";
}
