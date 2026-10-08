# StrengthBot

Bot for my friends to log workouts, track strength progress, and compare lifts through Discord. Built with TypeScript, Discord.js, and MongoDB, and hosted on a Raspberry Pi.

Use `/help` to browse six command categories: General, Body Weight, Measurements, Lifting, Progress, and Cardio. Previous and Next move between pages. Only the member who opened the menu can use its buttons, and the controls expire after two minutes.

Use `/loglift compound`, `/loglift isolation`, or `/loglift armwrestling` to save a lift. Choose an exercise, enter the amount lifted and your body weight in pounds, and optionally add `additionaldetails`. Each entry saves the date and returns a log ID. Your first entry establishes a starting personal record; a heavier entry highlights the new PR and how much it increased.

Example: `/loglift compound exercise:Barbell Bench amount:225 bodyweight:180 additionaldetails:Paused single`

`/viewlifts` uses the same three categories and shows up to five entries per page. Use Previous and Next to browse, and the optional `exercise` and `sort` fields to filter or sort by weight lifted, body weight, or date. The compound view shows your heaviest entry for each exercise by default; selecting an exercise shows its full history. Isolation and armwrestling views show all entries, newest first by default. Pagination controls expire after two minutes.

Example: `/viewlifts compound exercise:Barbell Bench sort:date-desc`

`/leaderboard` shows the top three distinct lifters for a compound or armwrestling exercise. Choose `weight` for the most weight lifted or `ratio` for weight lifted divided by body weight. `/progresschart` plots your logged weights over time for a compound or armwrestling exercise. `/strengthstandards` compares your best squat, bench, and deadlift with the bot's body weight standards for male lifters and shows your combined total.

`/onerepmax` estimates a one-rep max from the weight lifted and number of repetitions. Choose a formula or leave it blank to see all formula results and their average. `/convert` converts between kilograms and pounds.

Example: `/onerepmax weight:185 reps:5`

Use `/logbodyweight` to save your weight in pounds with optional notes, `/viewbodyweight` to review recent entries, and `/weeklybodyweight` to chart weekly averages. `/bmicalculator` calculates BMI from height and weight. `/ffmi` calculates Fat-Free Mass Index from height, weight, and body fat percentage.

Use `/logmeasurements` to record any combination of bicep, forearm, wrist, chest, and quad measurements in inches, with optional `notes`. At least one measurement is required. `/viewmeasurements` shows your recent entries; its optional `user` field lets you view another member's measurements.

Example: `/logmeasurements bicep:15.5 forearm:12.5 notes:Measured relaxed`

Use `/logcardio` to save a run or bike ride with body weight in pounds, time in `MM:SS` format, distance in miles, and optional notes. The reply includes your pace per mile. `/viewcardio` shows recent sessions. Body weight, measurement, and cardio views show up to 25 entries, newest first.

Example: `/logcardio cardiotype:run bodyweight:180 time:25:30 distance:3`

To remove an entry, copy its ID from the corresponding view and use `/removelift`, `/removebodyweightlog`, `/deletemeasurements`, or `/removecardio` with the `id` field. These commands remove only entries associated with your Discord username. Logs are currently associated with usernames rather than Discord user IDs, so changing your username affects which existing entries the bot finds.

Use `/askstrengthbot question:...` to ask a fitness or strength question. Questions can contain up to 500 characters. Replies come through Hugging Face's inference router and are kept short; this command sends your question without attaching your saved workout history. Progress charts, weekly weight charts, and the strength standards table use QuickChart.

For setup, run commands from the `StrengthBot` directory and create a `.env` file containing `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `MONGODB_URI`, and `HF_TOKEN`. Keep credentials out of Git. Workout data is stored in the MongoDB database `StrengthBotDb`.

```bash
npm install
npm run build
npm run deploy-commands
npm start
```

`npm run build` compiles the TypeScript source, `npm run deploy-commands` registers slash commands in the configured Discord server, and `npm start` runs the compiled bot. For PM2 startup and restarts on the host, follow [StrengthBot's deployment workflow](StrengthBot/SKILL.md).
