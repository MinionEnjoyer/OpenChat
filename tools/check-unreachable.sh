#!/usr/bin/env bash
# check-unreachable.sh — find components that are built, exported, and rendered NOWHERE.
#
# A feature can be fully implemented, correct, and comprehensively unit-tested while being
# completely unreachable from the app. Every unit test passes because every unit is right;
# the SEAM between the feature and a screen has no owner and no test.
#
# This project shipped FOURTEEN such components across voice, media, polls, DMs and
# blocking — all gated green. Three were found by a human on a device; the rest only by
# this check.
#
# Exits non-zero when a feature's public export is referenced nowhere outside its own
# directory. Allowlist genuine library-style exports in .unreachable-allow.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../apps/mobile" || exit 1
ALLOW="../../tools/.unreachable-allow"
found=0
for idx in src/features/*/index.ts; do
  feat=$(dirname "$idx")
  while read -r comp; do
    [ -z "$comp" ] && continue
    case "$comp" in type*) continue;; esac
    grep -qxF "$comp" "$ALLOW" 2>/dev/null && continue
    # Reachability is TRANSITIVE: a component may legitimately be composed by a
    # container inside its own feature, as long as that container is itself reached
    # by a screen. Requiring every export to be referenced OUTSIDE its feature
    # produced false positives for exactly that shape (VoiceChannelView renders
    # VoiceTileGrid/VideoTile/ScreenShareView; all four are genuinely reachable).
    #
    # So: a component is reachable if it is referenced anywhere outside its own
    # feature, OR referenced by a sibling in its feature that is itself reachable.
    outside=$(grep -rl "\b$comp\b" src App.tsx index.ts 2>/dev/null \
            | grep -v "^$feat/" | grep -v __tests__ | grep -v '\.test\.' | wc -l | tr -d ' ')
    inside=0
    if [ "$outside" -eq 0 ]; then
      # which siblings reference it?
      for sib in $(grep -rl "\b$comp\b" "$feat" 2>/dev/null | grep -v __tests__ | grep -v '\.test\.' | grep -v "/index.ts$"); do
        sibname=$(basename "$sib" | sed 's/\.[jt]sx\?$//')
        [ "$sibname" = "$comp" ] && continue
        # is that sibling itself reached from outside the feature?
        if [ "$(grep -rl "\b$sibname\b" src App.tsx index.ts 2>/dev/null | grep -v "^$feat/" | grep -v __tests__ | wc -l | tr -d ' ')" -gt 0 ]; then
          inside=1; break
        fi
      done
    fi
    if [ "$outside" -eq 0 ] && [ "$inside" -eq 0 ]; then
      echo "UNREACHABLE ${feat#src/features/}/$comp — exported but referenced by no screen"
      found=1
    fi
  done < <(grep -oE "export \{ [A-Za-z, ]+ \}" "$idx" 2>/dev/null \
            | sed 's/export { //;s/ }//' | tr ',' '\n' | tr -d ' ')
done
[ "$found" -eq 0 ] && echo "OK — every exported feature component is referenced by a screen"
exit "$found"
