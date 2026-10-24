import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "../dist/server.js";
import { fixture, ids, overwrite } from "./fixture.mjs";
import { PermissionFlagsBits as P } from "discord.js";

serveStdio(() =>
  createServer({
    guildIds: [ids.guild],
    async snapshot(guildId) {
      if (guildId !== ids.guild)
        throw new Error("sensitive-token-must-not-escape");
      const s = fixture();
      s.channels[2].permission_overwrites.push(
        overwrite(ids.member, 0n, P.ViewChannel, 1),
      );
      return s;
    },
    async member() {
      return { roles: [ids.demon] };
    },
  }),
);
