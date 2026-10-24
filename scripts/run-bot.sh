#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  StrengthBot|BookBot) bot_package="$1" ;;
  *) printf 'Choose StrengthBot or BookBot.\n' >&2; exit 2 ;;
esac

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p -- "$repo_root/.local"

# Both PM2 processes can start together at boot. Serialize preparation in their
# shared checkout, then release the lock before running either long-lived bot.
exec 9>"$repo_root/.local/bot-deploy.lock"
flock -w 180 9
git -C "$repo_root" pull --ff-only
cd -- "$repo_root/$bot_package"
rm -rf -- dist
npm run build
npm run deploy-commands
flock -u 9
exec 9>&-

exec node dist/index.js
