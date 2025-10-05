import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { CommandInteraction, CacheType } from 'discord.js';

const commands = [
  { name: '/askstrengthbot', desc: 'Ask StrengthBot any fitness or strength question (AI-powered, witty and informative).' },
  { name: '/bmicalculator', desc: 'Calculate your BMI (Body Mass Index) and see BMI ranges.' },
  { name: '/ffmi', desc: 'Calculate your Fat-Free Mass Index (FFMI) and see FFMI index values.' },
  {
    name: '/logbodyweight, /logawlift, /logcompoundlift, /logisolationlift, /logcardio',
    desc: 'Log an entry: body weight, Armwrestling lift, compound lift (bench, squat, deadlift), isolation lift (curl, triceps, etc), or cardio activity.',
  },
  { name: '/removebodyweightlog, /removecardio, /removelift', desc: 'Remove a logged entry by ID: body weight, cardio, or lift.' },
  {
    name: '/viewbodyweight, /weeklybodyweight, /viewcardio, /viewawlifts, /viewcompoundlifts, /viewisolationlifts',
    desc: 'View your logged entries: body weight, weekly averages, cardio, armwrestling lifts, compound lifts, and isolation lifts.',
  },
  { name: '/leaderboard', desc: 'View lift leaderboards (most weight, best ratio).' },
  { name: '/onerepmax', desc: 'Calculate your estimated one-rep max (1RM) with various formulas.' },
  { name: '/progresschart', desc: 'Show your progress chart for a specific exercise.' },
  { name: '/strengthstandards', desc: 'View strength standards for squat, bench, and deadlift.' },
];

export default {
  data: new SlashCommandBuilder().setName('help').setDescription('Show all available commands and what they do'),
  async execute(interaction: CommandInteraction<CacheType>) {
    const embed = new EmbedBuilder()
      .setTitle('StrengthBot Help & Commands')
      .setColor(0x3498db)
      .setDescription('Here are all the available commands:')
      .addFields(...commands.map((cmd) => ({ name: cmd.name, value: cmd.desc, inline: false })));
    await interaction.reply({ embeds: [embed] });
  },
};
