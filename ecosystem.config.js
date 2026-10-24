const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "strengthbot",
      cwd: path.join(__dirname, "StrengthBot"),
      script: "npm",
      args: "run cleanrun",
      interpreter: "none",
      restart_delay: 5000,
      time: true,
    },
    {
      name: "book-bot",
      cwd: path.join(__dirname, "BookBot"),
      script: "npm",
      args: "run cleanrun",
      interpreter: "none",
      restart_delay: 5000,
      time: true,
    },
  ],
};
