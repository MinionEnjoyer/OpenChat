#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

git add tools/devctl-README.md tools/devctl
git commit -m "[P0-10] devctl: --json on verify, tools/devctl-README.md covering all subcommands with JSON schemas and exit codes; doctor includes README; usage updated for selftest and seed subcommands" -m "## P0-10 completion

- tools/devctl-README.md — full documentation covering every subcommand, JSON output schemas, exit codes
- devctl doctor now checks for tools/devctl-README.md presence
- devctl usage() updated with all subcommands (selftest, seed, commit) and docs pointer
- --json flag support noted for health, capabilities, verify subcommands" 2>&1

echo "SHA: $(git rev-parse HEAD)"