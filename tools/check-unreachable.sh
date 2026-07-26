#!/usr/bin/env bash
# check-unreachable.sh — find components that are built and rendered NOWHERE.
#
# A feature can be fully implemented, correct, and comprehensively unit-tested while being
# completely unreachable from the app. Every unit test passes because every unit is right;
# the SEAM between the feature and a screen has no owner and no test.
#
# This project shipped FOURTEEN such components across voice, media, polls, DMs and
# blocking — all gated green. Three were found by a human on a device; the rest only by
# this check.
#
# Exits non-zero when a feature component is referenced nowhere outside its own
# directory. Allowlist genuine library-style exports in .unreachable-allow.
#
# Candidate sources (both must be covered — a component reachable through EITHER path
# is reachable):
#   1. Barrel exports from src/features/*/index.ts (original check)
#   2. Direct export function [A-Z]… in any .tsx file under src/features/
#
# Source 2 catches the blind spot: a fully-built component that was never re-exported
# from its feature barrel, so the original check never considered it. RolesEditorScreen
# sat unreachable for exactly this reason.
#
# Reachability is transitive: if component A is referenced by component B, and B is
# reachable (exported from the barrel, or referenced outside the feature, or itself
# transitively reachable), then A is reachable too. The check iteratively expands the
# reachable set until it stabilises, handling arbitrary-depth chains like
# MemberProfileSheet → MemberList → ShellScreen → App.tsx.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../apps/mobile" || exit 1
ALLOW="../../tools/.unreachable-allow"
found=0

for feat in src/features/*/; do
  feat="${feat%/}"
  feat_name=$(basename "$feat")

  # ── Collect all candidate components ──
  candidates=$(mktemp)
  trap "rm -f $candidates" EXIT

  # Source 1: barrel re-exports
  if [ -f "$feat/index.ts" ]; then
    grep -oE "export \{ [A-Za-z, ]+ \}" "$feat/index.ts" 2>/dev/null \
      | sed 's/export { //;s/ }//' | tr ',' '\n' | tr -d ' ' | grep -v '^$' \
      | grep -v '^type' >> "$candidates"
  fi

  # Source 2: export function PascalCase from .tsx files (catches barrel-blind components)
  grep -rhoE 'export function ([A-Z][A-Za-z0-9]+)' "$feat" --include='*.tsx' 2>/dev/null \
    | sed -E 's/export function //' >> "$candidates"

  sort -u "$candidates" -o "$candidates"

  if [ ! -s "$candidates" ]; then
    rm -f "$candidates"
    continue
  fi

  # ── Build the reachable set iteratively ──
  # Seed: components referenced OUTSIDE the feature (directly reachable).
  reachable=$(mktemp)
  trap "rm -f $candidates $reachable" EXIT

  while read -r comp; do
    [ -z "$comp" ] && continue
    if [ "$(grep -rl "\b$comp\b" src App.tsx index.ts 2>/dev/null \
          | grep -v "^$feat/" | grep -v __tests__ | grep -v '\.test\.' | wc -l | tr -d ' ')" -gt 0 ]; then
      echo "$comp" >> "$reachable"
    fi
  done < "$candidates"

  # Iteratively expand: any component referenced by a reachable sibling joins the reachable set.
  changed=1
  while [ "$changed" -eq 1 ]; do
    changed=0
    while read -r comp; do
      [ -z "$comp" ] && continue
      # already reachable?
      grep -qxF "$comp" "$reachable" 2>/dev/null && continue
      # referenced by any reachable sibling (within the feature, excluding own file)?
      for sib in $(grep -rl "\b$comp\b" "$feat" 2>/dev/null | grep -v __tests__ | grep -v '\.test\.'); do
        # skip if the reference is in the component's own file
        sibname=$(basename "$sib" | sed -E 's/\.[jt]sx?$//')
        [ "$sibname" = "$comp" ] && continue
        # Is the sibling itself reachable?
        if grep -qxF "$sibname" "$reachable" 2>/dev/null; then
          echo "$comp" >> "$reachable"
          changed=1
          break
        fi
        # Or is the sibling directly referenced outside the feature?
        if [ "$(grep -rl "\b$sibname\b" src App.tsx index.ts 2>/dev/null \
              | grep -v "^$feat/" | grep -v __tests__ | wc -l | tr -d ' ')" -gt 0 ]; then
          echo "$sibname" >> "$reachable"
          echo "$comp" >> "$reachable"
          changed=1
          break
        fi
      done
    done < "$candidates"
    sort -u "$reachable" -o "$reachable"
  done

  # ── Report unreachable ──
  while read -r comp; do
    [ -z "$comp" ] && continue
    grep -qxF "$comp" "$ALLOW" 2>/dev/null && continue
    grep -qxF "$comp" "$reachable" 2>/dev/null && continue
    echo "UNREACHABLE ${feat#src/features/}/$comp — exported but referenced by no screen"
    found=1
  done < "$candidates"

  rm -f "$reachable"
done

[ "$found" -eq 0 ] && echo "OK — every exported feature component is referenced by a screen"
exit "$found"
