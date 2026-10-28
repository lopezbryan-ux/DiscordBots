import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { readConfig, safeError } from "./config.js";
import { createSource } from "./discord.js";
import { createServer } from "./server.js";

try {
  const { token, guildIds, applications } = readConfig();
  const source = createSource(token, guildIds, applications);
  await serveStdio(() => createServer(source));
} catch (error) {
  console.error(safeError(error));
  process.exitCode = 1;
}
