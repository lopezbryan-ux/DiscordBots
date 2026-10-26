import assert from 'node:assert/strict';
import test from 'node:test';
import { MessageFlags, PermissionsBitField } from 'discord.js';
import { executeInCommandChannel, parseCommandChannels } from '../dist/utils/commandChannels.js';

const guildId = '100000000000000001';
const channelId = '100000000000000002';
const otherChannelId = '100000000000000003';
const otherGuildId = '100000000000000004';
const channels = parseCommandChannels(JSON.stringify({ [guildId]: channelId }));

async function run(overrides = {}, restrictions = channels) {
  const replies = [];
  let executions = 0;
  const interaction = {
    guildId,
    channelId,
    async reply(options) {
      replies.push(options);
    },
    ...overrides,
  };
  await executeInCommandChannel(interaction, restrictions, async () => {
    executions++;
  });
  return { replies, executions };
}

test('commands execute in the configured channel without a redirect', async () => {
  assert.deepEqual(await run(), { replies: [], executions: 1 });
});

test('commands in another channel are rejected privately before their handler executes', async () => {
  const result = await run({ channelId: otherChannelId });
  assert.equal(result.executions, 0);
  assert.deepEqual(result.replies, [
    {
      content: `Use StrengthBot commands in <#${channelId}>.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    },
  ]);
});

test('administrators cannot bypass the channel restriction', async () => {
  const result = await run({
    channelId: otherChannelId,
    memberPermissions: new PermissionsBitField(PermissionsBitField.Flags.Administrator),
  });
  assert.equal(result.executions, 0);
  assert.equal(result.replies[0].flags, MessageFlags.Ephemeral);
});

test('threads inside the configured channel are also redirected to the channel itself', async () => {
  const result = await run({ channelId: otherChannelId, channel: { parentId: channelId, isThread: () => true } });
  assert.equal(result.executions, 0);
  assert.match(result.replies[0].content, new RegExp(channelId));
});

test('a configured restriction does not change commands in another server', async () => {
  assert.deepEqual(await run({ guildId: otherGuildId, channelId: otherChannelId }), { replies: [], executions: 1 });
});

test('each server uses its own configured channel', async () => {
  const restrictions = parseCommandChannels(JSON.stringify({ [guildId]: channelId, [otherGuildId]: otherChannelId }));
  assert.equal((await run({ guildId: otherGuildId, channelId: otherChannelId }, restrictions)).executions, 1);
  assert.equal((await run({ guildId: otherGuildId, channelId }, restrictions)).executions, 0);
});

test('direct messages cannot execute commands', async () => {
  const result = await run({ guildId: null });
  assert.equal(result.executions, 0);
  assert.equal(result.replies[0].flags, MessageFlags.Ephemeral);
});

test('omitting channel configuration preserves unrestricted server commands', async () => {
  for (const value of [undefined, '', '  ', '{}']) {
    assert.deepEqual(await run({ channelId: otherChannelId }, parseCommandChannels(value)), { replies: [], executions: 1 });
  }
});

test('malformed configuration fails without echoing its value', () => {
  for (const value of [
    'private-value',
    'null',
    '[]',
    'true',
    '"private-value"',
    '{"bad-server":"bad-channel"}',
    JSON.stringify({ [guildId]: 100 }),
  ]) {
    assert.throws(() => parseCommandChannels(value), {
      message: 'COMMAND_CHANNELS_BY_GUILD must be a JSON object mapping Discord server IDs to channel IDs.',
    });
  }
});
