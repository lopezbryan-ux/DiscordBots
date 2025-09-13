import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(__filename, '../../../../');
const LOG_FILE = path.join(projectRoot, 'lift_logs.json');

export default {
  data: new SlashCommandBuilder()
    .setName('removelift')
    .setDescription('Remove a logged lift by index')
    .addIntegerOption((option) => option.setName('index').setDescription('Index of the lift to remove (see /viewlifts)').setRequired(true)),
  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const username = chatInteraction.user.username;
    const index = chatInteraction.options.getInteger('index', true);
    let logs = [];
    if (fs.existsSync(LOG_FILE)) {
      logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    }
    if (index < 0 || index >= logs.length) {
      await interaction.reply({ content: 'Invalid index. Use /viewlifts to see your lift indexes.', ephemeral: true });
      return;
    }
    const entryToRemove = logs[index];
    if (entryToRemove.username !== username) {
      await interaction.reply({ content: 'You can only remove your own lifts.', ephemeral: true });
      return;
    }
    logs.splice(index, 1);
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
    // Format removed entry info
    const dateOnly = entryToRemove.date ? entryToRemove.date.split('T')[0] : '';
    let details = `Removed lift (id: ${index}):\n`;
    details += `User: ${entryToRemove.username}\n`;
    details += `Exercise: ${entryToRemove.exercise}\n`;
    details += `Amount: ${entryToRemove.amount} lbs\n`;
    details += `Bodyweight: ${entryToRemove.bodyweight} lbs\n`;
    details += `Date: ${dateOnly}\n`;
    if (entryToRemove.additionaldetails) {
      details += `Details: ${entryToRemove.additionaldetails}\n`;
    }
    await interaction.reply({ content: details });
  },
};
