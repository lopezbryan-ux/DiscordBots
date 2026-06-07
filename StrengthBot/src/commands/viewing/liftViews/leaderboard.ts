import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { mongoClient } from '../../../index.js';
import { ArmWrestlingLifts, CompoundLifts } from '../../../utils/liftingUtils/liftChoices.js';
import { DATABASE_NAME, LiftLog, LIFTS_COLLECTION } from '../viewHelpers.js';

const WEIGHT_COLOR = 0xffd700;
const RATIO_COLOR = 0x00bfff;
const LEADERBOARD_LIMIT = 3;

interface RatioLiftLog extends LiftLog {
  ratio: number;
}

function getTopUniqueUsers<T extends LiftLog>(sortedLogs: T[], limit: number): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const log of sortedLogs) {
    if (seen.has(log.username)) continue;

    seen.add(log.username);
    result.push(log);

    if (result.length === limit) break;
  }

  return result;
}

export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View lift leaderboards')
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('Leaderboard type')
        .setRequired(true)
        .addChoices({ name: 'Most Weight Lifted', value: 'weight' }, { name: 'Best Bodyweight Ratio', value: 'ratio' }),
    )
    .addStringOption((option) =>
      option
        .setName('exercise')
        .setDescription('Exercise category')
        .setRequired(true)
        .addChoices(...ArmWrestlingLifts, ...CompoundLifts),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    try {
      const type = interaction.options.getString('type', true);
      const exercise = interaction.options.getString('exercise', true);
      const liftsCollection = mongoClient.db(DATABASE_NAME).collection<LiftLog>(LIFTS_COLLECTION);
      const logs = await liftsCollection.find({ exercise }).toArray();

      if (type === 'weight') {
        const sorted = logs.sort((a, b) => b.amount - a.amount);
        const topUnique = getTopUniqueUsers(sorted, LEADERBOARD_LIMIT);
        const embed = new EmbedBuilder()
          .setTitle(`Most Weight Lifted (${exercise})`)
          .setColor(WEIGHT_COLOR)
          .setDescription(topUnique.length ? 'Top 3 unique lifters by weight lifted' : 'No entries yet.');

        topUnique.forEach((entry, index) => {
          const value = [`**Amount:** ${entry.amount} lbs`, `**Bodyweight:** ${entry.bodyweight} lbs`, `**Date:** ${entry.date}`];

          if (entry.additionaldetails) {
            value.push(`**Details:** ${entry.additionaldetails}`);
          }

          embed.addFields({ name: `#${index + 1} ${entry.username}`, value: value.join('\n'), inline: false });
        });

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (type === 'ratio') {
        const logsWithRatio: RatioLiftLog[] = logs.filter((log) => log.bodyweight > 0).map((log) => ({ ...log, ratio: log.amount / log.bodyweight }));
        const sorted = logsWithRatio.sort((a, b) => b.ratio - a.ratio);
        const topUnique = getTopUniqueUsers(sorted, LEADERBOARD_LIMIT);
        const embed = new EmbedBuilder()
          .setTitle(`Best Bodyweight-to-Weight Ratio (${exercise})`)
          .setColor(RATIO_COLOR)
          .setDescription(topUnique.length ? 'Top 3 unique lifters by ratio' : 'No entries yet.');

        topUnique.forEach((entry, index) => {
          const value = [`**Ratio:** ${entry.ratio.toFixed(2)}`, `**Amount:** ${entry.amount} lbs`, `**Bodyweight:** ${entry.bodyweight} lbs`];

          if (entry.additionaldetails) {
            value.push(`**Details:** ${entry.additionaldetails}`);
          }

          embed.addFields({ name: `#${index + 1} ${entry.username}`, value: value.join('\n'), inline: false });
        });

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      await interaction.editReply('Invalid leaderboard type.');
    } catch (err) {
      console.error('Error in leaderboard command:', err);
      await interaction.editReply('There was an error while executing this command.');
    }
  },
};
