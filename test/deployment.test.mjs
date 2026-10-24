import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "discord-bots-deployment-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, "bin");
  mkdirSync(bin);
  mkdirSync(join(root, "scripts"));
  copyFileSync(
    new URL("../scripts/run-bot.sh", import.meta.url),
    join(root, "scripts/run-bot.sh"),
  );
  for (const name of ["StrengthBot", "BookBot"]) {
    mkdirSync(join(root, name, "dist"), { recursive: true });
    writeFileSync(join(root, name, "dist/stale.js"), "stale build");
  }
  const helper = join(root, "mock.mjs");
  writeFileSync(
    helper,
    `import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
const root = process.env.MOCK_ROOT;
const trace = join(root, "trace.jsonl");
const packageName = basename(process.cwd());
const [tool, ...args] = process.argv.slice(2);
const event = (step) => appendFileSync(trace, JSON.stringify({ step, packageName }) + "\\n");
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
if (tool === "git") {
  if (JSON.stringify(args) !== JSON.stringify(["-C", root, "pull", "--ff-only"])) process.exit(9);
  try { mkdirSync(join(root, "preparing")); } catch { event("overlap"); process.exit(10); }
  event("pull");
  await pause(75);
} else if (tool === "npm" && args[1] === "build") {
  event("build");
  if (process.env.MOCK_FAIL_BUILD === packageName) process.exit(7);
  mkdirSync("dist", { recursive: true });
  writeFileSync("dist/index.js", "compiled");
} else if (tool === "npm" && args[1] === "deploy-commands") {
  event("register");
  rmSync(join(root, "preparing"), { recursive: true });
} else if (tool === "node") {
  event("run");
  const deadline = Date.now() + 5000;
  while (readFileSync(trace, "utf8").split("\\n").filter(line => line && JSON.parse(line).step === "run").length < 2) {
    if (Date.now() > deadline) { event("launch-timeout"); process.exit(11); }
    await pause(25);
  }
} else process.exit(12);
`,
  );
  for (const tool of ["git", "npm", "node"]) {
    writeFileSync(
      join(bin, tool),
      `#!/bin/sh\nexec '${process.execPath}' '${helper}' ${tool} "$@"\n`,
      { mode: 0o700 },
    );
  }
  return {
    root,
    events: () =>
      readFileSync(join(root, "trace.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    launch: (name, extraEnv = {}) =>
      new Promise((resolve, reject) => {
        const child = spawn("/bin/bash", ["scripts/run-bot.sh", name], {
          cwd: root,
          env: {
            ...process.env,
            PATH: `${bin}:/usr/bin:/bin`,
            MOCK_ROOT: root,
            ...extraEnv,
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stderr = "";
        child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
        child.on("error", reject);
        child.on("close", (code) => resolve({ code, stderr }));
      }),
  };
}

test(
  "simultaneous bot startup serializes preparation and allows both bots to run",
  { timeout: 15000 },
  async (t) => {
    const f = fixture(t);
    const results = await Promise.all([
      f.launch("StrengthBot"),
      f.launch("BookBot"),
    ]);
    for (const result of results) assert.equal(result.code, 0, result.stderr);
    const events = f.events();
    assert.ok(!events.some(({ step }) => step === "overlap"));
    const preparations = events.filter(({ step }) =>
      ["pull", "build", "register"].includes(step),
    );
    assert.deepEqual(
      preparations.map(({ step }) => step),
      ["pull", "build", "register", "pull", "build", "register"],
    );
    for (const name of ["StrengthBot", "BookBot"]) {
      assert.deepEqual(
        events
          .filter(({ packageName }) => packageName === name)
          .map(({ step }) => step),
        ["build", "register", "run"],
      );
      assert.equal(existsSync(join(f.root, name, "dist/stale.js")), false);
    }
  },
);

test(
  "a failed build prevents command registration and bot startup",
  { timeout: 10000 },
  async (t) => {
    const f = fixture(t);
    const result = await f.launch("BookBot", { MOCK_FAIL_BUILD: "BookBot" });
    assert.equal(result.code, 7, result.stderr);
    assert.deepEqual(
      f.events().map(({ step }) => step),
      ["pull", "build"],
    );
  },
);
