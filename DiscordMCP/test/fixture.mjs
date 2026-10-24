import { PermissionFlagsBits as P, ChannelType } from "discord.js";

export const ids = {
  guild: "100000000000000001",
  member: "100000000000000002",
  owner: "100000000000000003",
  demon: "100000000000000004",
  smiters: "100000000000000005",
  admin: "100000000000000006",
  deny: "100000000000000007",
  entrance: "100000000000000008",
  general: "100000000000000009",
  category: "100000000000000010",
};

export const role = (id, name, permissions, position = 0) => ({
  id,
  name,
  permissions: permissions.toString(),
  position,
  managed: false,
  mentionable: false,
});
export const overwrite = (id, allow = 0n, deny = 0n, type = 0) => ({
  id,
  type,
  allow: allow.toString(),
  deny: deny.toString(),
});

export function fixture() {
  return {
    guild: {
      id: ids.guild,
      name: "Test server",
      owner_id: ids.owner,
      features: [],
      system_channel_id: ids.entrance,
    },
    roles: [
      role(
        ids.guild,
        "@everyone",
        P.SendMessages |
          P.ReadMessageHistory |
          P.UseApplicationCommands |
          P.AttachFiles |
          P.EmbedLinks |
          P.MentionEveryone,
      ),
      role(ids.demon, "Demon", P.ViewChannel, 1),
      role(ids.smiters, "Smiters", 0n, 2),
      role(ids.admin, "Admin", P.Administrator, 3),
      role(ids.deny, "Deny", 0n, 4),
    ],
    channels: [
      {
        id: ids.category,
        name: "Members",
        type: ChannelType.GuildCategory,
        position: 0,
        permission_overwrites: [overwrite(ids.guild, 0n, P.ViewChannel)],
      },
      {
        id: ids.entrance,
        name: "entrance-exam",
        type: ChannelType.GuildText,
        position: 0,
        permission_overwrites: [overwrite(ids.guild, P.ViewChannel)],
      },
      {
        id: ids.general,
        name: "general",
        type: ChannelType.GuildText,
        position: 1,
        parent_id: ids.category,
        permission_overwrites: [],
      },
    ],
    fetchedAt: new Date(0).toISOString(),
  };
}
