import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { CommandInteraction, CacheType } from 'discord.js';

const commands = [
  { name: '/askstrengthbot', desc: 'Ask StrengthBot any fitness or strength question (AI-powered, witty and informative).' },
  { name: '/bmicalculator', desc: 'Calculate your BMI (Body Mass Index) and see BMI ranges.' },
  { name: '/ffmi', desc: 'Calculate your Fat-Free Mass Index (FFMI) and see FFMI index values.' },
  { name: '/logbodyweight', desc: 'Log your body weight.' },
  { name: '/removebodyweightlog', desc: 'Remove a logged body weight entry by ID.' },
  { name: '/logcardio', desc: 'Log a cardio activity (run, bike, etc).' },
  { name: '/removecardio', desc: 'Remove a logged cardio activity by ID.' },
  { name: '/logawlift', desc: 'Log an Armwrestling lift.' },
  { name: '/logcompoundlift', desc: 'Log a compound lift (bench, squat, deadlift, etc).' },
  { name: '/logisolationlift', desc: 'Log an isolation lift (curl, triceps, etc).' },
  { name: '/removelift', desc: 'Remove a logged lift by ID.' },
  { name: '/viewbodyweight', desc: 'View your logged body weights.' },
  { name: '/weeklybodyweight', desc: 'View your weekly average body weight (with chart).' },
  { name: '/viewcardio', desc: 'View all your logged cardio activities.' },
  { name: '/leaderboard', desc: 'View lift leaderboards (most weight, best ratio).' },
  { name: '/onerepmax', desc: 'Calculate your estimated one-rep max (1RM) with various formulas.' },
  { name: '/progresschart', desc: 'Show your progress chart for a specific exercise.' },
  { name: '/strengthstandards', desc: 'View strength standards for squat, bench, and deadlift.' },
  { name: '/viewawlifts', desc: 'View your logged Armwrestling lifts.' },
  { name: '/viewcompoundlifts', desc: 'View your logged compound lifts.' },
  { name: '/viewisolationlifts', desc: 'View your logged isolation lifts.' },
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
