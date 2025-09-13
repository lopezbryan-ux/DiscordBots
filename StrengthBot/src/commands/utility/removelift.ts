import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';

import db from '../../utils/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('removelift')
    .setDescription('Remove a logged lift by ID')
    .addIntegerOption((option) => option.setName('id').setDescription('ID of the lift to remove (see /viewlifts)').setRequired(true)),
  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const username = chatInteraction.user.username;
    const id = chatInteraction.options.getInteger('id', true);
    // Find the lift entry by id and username
    interface LiftLogEntry {
      id: number;
      username: string;
      date: string;
      exercise: string;
      amount: number;
      bodyweight: number;
      additionaldetails: string;
    }
    const entryToRemove = db.prepare('SELECT * FROM lifts WHERE id = ? AND username = ?').get(id, username) as LiftLogEntry | undefined;
    if (!entryToRemove) {
      await interaction.reply({
        content: 'Invalid ID or you do not own this lift. Use /viewlifts to see your lift IDs.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    db.prepare('DELETE FROM lifts WHERE id = ? AND username = ?').run(id, username);
    // Format removed entry info
    const dateOnly = entryToRemove.date ? entryToRemove.date.split('T')[0] : '';
    let details = `Removed lift (ID: ${id}):\n`;
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
