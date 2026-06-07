# Agent Guide

## Project Overview

StrengthBot is a Node.js/TypeScript Discord bot. Source code lives in `src`, compiled output goes to `dist`, and project scripts are defined in `package.json`.

## Local Setup

- Install dependencies with `npm.cmd install` on Windows.
- Keep secrets in `.env`; do not commit environment files or credentials.
- Use `npm.cmd` instead of `npm` in PowerShell if script execution policy blocks `npm.ps1`.

## Common Commands

- `npm.cmd run build` - compile TypeScript.
- `npm.cmd run lint` - run ESLint.
- `npm.cmd run format` - run Prettier, if configured in `package.json`.
- `npm.cmd start` - run the compiled bot, if configured in `package.json`.

## Coding Notes

- Follow the existing TypeScript style and module organization.
- Prefer focused changes over broad refactors.
- Keep generated files in `dist` out of manual edits; update source files in `src` instead.
- Add or update tests when changing behavior, if the project has a test harness.
- Make sure to format document using prettier

## Git Hygiene

- Check `git status` before editing and avoid overwriting unrelated user changes.
- Do not commit secrets, tokens, logs, or local machine configuration.
- Mention any commands run and any commands that could not be run in the final response.
