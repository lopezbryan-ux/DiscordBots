import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ArmWrestlingLifts } from '../../utils/liftChoices.js';

// Always resolve to project root, not dist/src
const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(__filename, '../../../../');
const LOG_FILE = path.join(projectRoot, 'lift_logs.json');

export default {
  data: new SlashCommandBuilder()
    .setName('logawlift')
    .setDescription('Log an Armwrestling lift')
    .addStringOption((option) =>
      option
        .setName('exercise')
        .setDescription('Armwrestling exercise')
        .setRequired(true)
        .addChoices(...ArmWrestlingLifts),
    )
    .addNumberOption((option) => option.setName('amount').setDescription('Amount lifted(lbs)').setRequired(true))
    .addNumberOption((option) => option.setName('bodyweight').setDescription('Your body weight(lbs)').setRequired(true))
    .addStringOption((option) => option.setName('additionaldetails').setDescription('Additional details (optional)').setRequired(false)),
  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const username = chatInteraction.user.username;
    const date = new Date().toLocaleDateString('en-CA');
    const exercise = chatInteraction.options.getString('exercise', true);
    const amount = chatInteraction.options.getNumber('amount', true);
    const bodyweight = chatInteraction.options.getNumber('bodyweight', true);
    const additionaldetails = chatInteraction.options.getString('additionaldetails') || '';
    const liftCategory = 'ArmWrestling';
    const logEntry = {
      username,
      date,
      exercise,
      amount,
      bodyweight,
      additionaldetails,
      liftCategory,
    };

    let logs = [];
    if (fs.existsSync(LOG_FILE)) {
      logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    }
    logs.push(logEntry);
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));

    await interaction.reply(
      `Logged: ${exercise} - ${amount}lbs @ ${bodyweight}lbs bodyweight on ${date} ${additionaldetails ? `(${additionaldetails})` : ''}`,
    );
  },
};
