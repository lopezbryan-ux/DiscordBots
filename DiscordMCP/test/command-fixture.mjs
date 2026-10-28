import { writeFixture } from "./write-fixture.mjs";
import { ids } from "./ids.mjs";

export const applicationId = "100000000000000030";
export const globalCommandId = "100000000000000032";
export const guildCommandId = "100000000000000033";
export const commandApplication = {
  id: applicationId,
  name: "Fitness fixture",
  botToken: "fictional-command-bot-token",
  oauthToken: "fictional-command-user-token",
};

export function commandFixture() {
  const base = writeFixture();
  const route = `/applications/${applicationId}/guilds/${ids.guild}/commands`;
  const record = (id, permissions) => ({
    id,
    application_id: applicationId,
    guild_id: ids.guild,
    permissions,
  });
  const state = {
    identityId: applicationId,
    authorization: {
      application: { id: applicationId },
      user: { id: ids.owner },
      scopes: ["applications.commands.permissions.update", "identify"],
      expires: new Date(Date.now() + 3600000).toISOString(),
    },
    records: [
      record(applicationId, [
        { id: ids.demon, type: 1, permission: false },
        { id: ids.general, type: 3, permission: true },
      ]),
      record(guildCommandId, [{ id: ids.member, type: 2, permission: true }]),
    ],
    puts: [],
    calls: [],
    failPut: false,
    failAuthorization: false,
    globals: [
      {
        id: globalCommandId,
        application_id: applicationId,
        type: 1,
        name: "global-fitness",
        default_member_permissions: null,
      },
    ],
    guilds: [
      {
        id: guildCommandId,
        application_id: applicationId,
        guild_id: ids.guild,
        type: 1,
        name: "guild-fitness",
        default_member_permissions: null,
      },
    ],
  };
  const clone = (value) => structuredClone(value);
  const handlers = {
    async get(path) {
      state.calls.push({
        method: "get",
        path,
        authPrefix: this.options?.authPrefix,
      });
      if (path === "/oauth2/applications/@me")
        return {
          id: state.identityId,
          private_field: "sensitive-token-must-not-escape",
        };
      if (path === "/oauth2/@me") {
        if (state.failAuthorization)
          throw new Error("sensitive-token-must-not-escape");
        return clone(state.authorization);
      }
      if (path === `/applications/${applicationId}/commands`)
        return clone(state.globals);
      if (path === route) return clone(state.guilds);
      if (path === `${route}/permissions`) return clone(state.records);
      return base.handlers.get.call(this, path);
    },
    async put(path, options) {
      if (!path.startsWith(`${route}/`))
        return base.handlers.put.call(this, path, options);
      const call = {
        method: "put",
        path,
        body: clone(options.body),
        authPrefix: this.options?.authPrefix,
      };
      state.calls.push(call);
      state.puts.push(call);
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (state.failPut) throw new Error("sensitive-token-must-not-escape");
      const commandId = path.split("/").at(-2);
      const result = record(commandId, clone(options.body.permissions));
      state.records = [
        ...state.records.filter((r) => r.id !== commandId),
        result,
      ];
      return clone(result);
    },
    post: base.handlers.post,
    patch: base.handlers.patch,
    delete: base.handlers.delete,
  };
  return { ...base, handlers, commandState: state };
}
