import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';

const discordId = /^\d{17,20}$/;
const configurationError = 'COMMAND_CHANNELS_BY_GUILD must be a JSON object mapping Discord server IDs to channel IDs.';

export function parseCommandChannels(value?: string): ReadonlyMap<string, string> {
  if (!value?.trim()) return new Map();

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(configurationError);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(configurationError);
  }

  const channels = new Map<string, string>();
  for (const [guildId, channelId] of Object.entries(parsed)) {
    if (!discordId.test(guildId) || typeof channelId !== 'string' || !discordId.test(channelId)) {
      throw new Error(configurationError);
    }
    channels.set(guildId, channelId);
  }
  return channels;
}

type CommandInteraction = Pick<ChatInputCommandInteraction, 'guildId' | 'channelId' | 'reply'>;

export async function executeInCommandChannel(
  interaction: CommandInteraction,
  channels: ReadonlyMap<string, string>,
  execute: () => Promise<void>,
): Promise<void> {
  const allowedChannelId = interaction.guildId ? channels.get(interaction.guildId) : undefined;
  if (!interaction.guildId || (allowedChannelId && interaction.channelId !== allowedChannelId)) {
    await interaction.reply({
      content: allowedChannelId ? `Use StrengthBot commands in <#${allowedChannelId}>.` : 'Use StrengthBot commands in a server channel.',
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  await execute();
}
