#!/usr/bin/env sh
# Deploys the last commit to the Raspberry Pi (Git Bash / Linux / macOS).
#   scripts/deploy.sh [overlay-dir]
# Needs the "weather-pi" host in ~/.ssh/config (see README, section "Αυτόματο deploy").
# An optional overlay directory is copied on top of the commit before it ships: use it for files
# that must not live in git, such as a docker-compose.override.yml.
set -eu
cd "$(dirname "$0")/.."
[ -z "$(git status --porcelain)" ] || echo "WARNING: uncommitted changes are not deployed, only the last commit" >&2

overlay=${1:-}
if [ -z "$overlay" ]; then
  git archive --format=tar.gz HEAD | ssh weather-pi deploy
  exit $?
fi

[ -d "$overlay" ] || { echo "Overlay directory not found: $overlay" >&2; exit 1; }
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
git archive --format=tar HEAD | tar -x -C "$stage"
cp -R "$overlay"/. "$stage"/
echo ">> deploying HEAD + $(cd "$overlay" && find . -type f | sed 's|^\./||' | tr '\n' ' ')"
tar -czf - -C "$stage" . | ssh weather-pi deploy
