import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "../dist/server.js";
import { ids, overwrite } from "./fixture.mjs";
import { PermissionFlagsBits as P } from "discord.js";
import { REST } from "discord.js";
import { createSource } from "../dist/discord.js";
import { commandFixture, commandApplication } from "./command-fixture.mjs";

const mock = commandFixture();
mock.state.channels[2].permission_overwrites.push(
  overwrite(ids.member, 0n, P.ViewChannel, 1),
);
Object.assign(REST.prototype, mock.handlers);

serveStdio(() =>
  createServer(
    createSource("fictional-fixture-token", [ids.guild], [commandApplication]),
  ),
);
