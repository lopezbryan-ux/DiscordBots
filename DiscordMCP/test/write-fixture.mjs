import { ChannelType, PermissionFlagsBits as P } from "discord.js";
import { fixture, ids, role, overwrite } from "./fixture.mjs";

export const botId = "100000000000000020";
export const botRoleId = "100000000000000021";

// A fake Discord API shared by offline source tests and the stdio fixture.
// Its state is isolated from the live configuration and any Discord token.
export function writeFixture() {
  const state = fixture();
  state.roles.push({
    ...role(
      botRoleId,
      "MCP bot",
      P.ViewChannel | P.ManageRoles | P.ManageChannels,
      5,
    ),
    managed: true,
  });
  state.channels[0].permission_overwrites.push(
    overwrite(botRoleId, P.ViewChannel),
  );
  const members = new Map([
    [botId, { roles: [botRoleId] }],
    [ids.member, { roles: [ids.demon] }],
    [ids.owner, { roles: [ids.admin] }],
  ]);
  const calls = [];
  let nextId = 100000000000000100n;
  const notFound = () => {
    throw Object.assign(new Error("secret upstream data"), { status: 404 });
  };
  const clone = (value) =>
    value === undefined ? value : structuredClone(value);
  const handlers = {
    async get(path) {
      calls.push({ method: "get", path });
      if (decodeURIComponent(path) === "/users/@me")
        return { id: botId, username: "Test MCP", bot: true };
      if (path === `/guilds/${ids.guild}`) return clone(state.guild);
      if (path === `/guilds/${ids.guild}/roles`) return clone(state.roles);
      if (path === `/guilds/${ids.guild}/channels`)
        return clone(state.channels);
      if (path.startsWith(`/guilds/${ids.guild}/members/`))
        return clone(members.get(path.split("/").at(-1)) ?? notFound());
      return notFound();
    },
  };
  for (const method of ["post", "patch", "put", "delete"]) {
    handlers[method] = async (path, options = {}) => {
      calls.push({ method, path, ...clone(options) });
      const body = options.body;
      if (body?.name === "upstream-error")
        throw new Error("sensitive-token-must-not-escape");
      if (method === "post" && path === `/guilds/${ids.guild}/roles`) {
        const created = {
          ...role(String(nextId++), body.name, BigInt(body.permissions), 1),
          ...body,
        };
        state.roles.push(created);
        return clone(created);
      }
      if (method === "post" && path === `/guilds/${ids.guild}/channels`) {
        const parent = state.channels.find(
          (channel) => channel.id === body.parent_id,
        );
        const created = {
          id: String(nextId++),
          type: ChannelType.GuildText,
          position: 0,
          permission_overwrites: clone(parent?.permission_overwrites ?? []),
          ...body,
        };
        state.channels.push(created);
        return clone(created);
      }
      if (
        method === "patch" &&
        path.startsWith(`/guilds/${ids.guild}/roles/`)
      ) {
        const found =
          state.roles.find((entry) => entry.id === path.split("/").at(-1)) ??
          notFound();
        Object.assign(found, body);
        return clone(found);
      }
      if (path.startsWith(`/guilds/${ids.guild}/members/`)) {
        const parts = path.split("/");
        const found = members.get(parts[4]) ?? notFound();
        const roleId = parts[6];
        found.roles =
          method === "put"
            ? [...new Set([...found.roles, roleId])]
            : found.roles.filter((id) => id !== roleId);
        return;
      }
      const channel =
        state.channels.find((entry) => entry.id === path.split("/")[2]) ??
        notFound();
      if (method === "patch") {
        Object.assign(channel, body);
        return clone(channel);
      }
      const targetId = path.split("/").at(-1);
      channel.permission_overwrites = channel.permission_overwrites.filter(
        (entry) => entry.id !== targetId,
      );
      if (method === "put")
        channel.permission_overwrites.push(
          overwrite(targetId, BigInt(body.allow), BigInt(body.deny), body.type),
        );
    };
  }
  return {
    state,
    members,
    calls,
    handlers,
    mutations: () => calls.filter((call) => call.method !== "get"),
  };
}
