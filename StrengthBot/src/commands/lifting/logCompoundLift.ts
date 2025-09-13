import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { validateAmount, validateBodyweight } from '../../utils/validations.js';
import { CommandInteraction, CacheType, ChatInputCommandInteraction } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Always resolve to project root, not dist/src
const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(__filename, '../../../../');
const LOG_FILE = path.join(projectRoot, 'lift_logs.json');

export default {
  data: new SlashCommandBuilder()
    .setName('logcompoundlift')
    .setDescription('Log a lift')
    .addStringOption((option) =>
      option.setName('exercise').setDescription('Exercise name').setRequired(true).addChoices(
        { name: 'Barbell Squat', value: 'Barbell Squat' },
        { name: 'Barbell Bench', value: 'Barbell Bench' },
        { name: 'Barbell Deadlift', value: 'Barbell Deadift' },
        // { name: 'Side Pressure', value: 'Side Pressure' }, // Removed 'Side Pressure'
      ),
    )
    .addNumberOption((option) => option.setName('amount').setDescription('Amount lifted(lbs)').setRequired(true))
    .addNumberOption((option) => option.setName('bodyweight').setDescription('Your body weight(lbs)').setRequired(true))
    .addStringOption((option) => option.setName('datename').setDescription('Custom name for the date (optional)').setRequired(false)),
  async execute(interaction: CommandInteraction<CacheType>) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const username = chatInteraction.user.username;
    const date = new Date().toLocaleDateString('en-CA');
    const exercise = chatInteraction.options.getString('exercise', true);
    const amount = chatInteraction.options.getNumber('amount', true);
    const amountError = validateAmount(amount);
    if (amountError) {
      await interaction.reply({ content: amountError, flags: MessageFlags.Ephemeral });
      return;
    }
    const bodyweight = chatInteraction.options.getNumber('bodyweight', true);
    const bodyweightError = validateBodyweight(bodyweight);
    if (bodyweightError) {
      await interaction.reply({ content: bodyweightError, flags: MessageFlags.Ephemeral });
      return;
    }
    const datename = chatInteraction.options.getString('datename') || '';
    const liftCategory = 'The big three';
    const logEntry = {
      username,
      date,
      exercise,
      amount,
      bodyweight,
      datename,
      liftCategory,
    };

    let logs = [];
    if (fs.existsSync(LOG_FILE)) {
      logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    }
    logs.push(logEntry);
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));

    await interaction.reply(`Logged: ${exercise} - ${amount}lbs @ ${bodyweight}lbs bodyweight on ${date} ${datename ? `(${datename})` : ''}`);
  },
};
