#!/usr/bin/env bash
# check-orphans.sh — WHY THIS GATE EXISTS
#
# On 2026-07-26 the notification feature shipped with every component unit-tested
# and green while being completely non-functional, because nothing connected them.
# A module can have 100% test coverage and still contribute zero to the running
# application — tests exercise the module in isolation, but only the import graph
# from real entrypoints tells you whether it is actually wired into production.
#
# A naive "no importer outside its own feature directory" heuristic was tried first.
# It produced 3/3 false positives: modules consumed only within their own feature
# (e.g. a helper imported only by sibling files in the same directory) were
# flagged as orphans. That heuristic is wrong — a module used only within its own
# feature directory is NORMAL and CORRECT. The problem is modules NO ONE reaches.
#
# The working model:
#   - Reachability from real production entrypoints (App.tsx, index.js, main.ts),
#     not test files, not arbitrary directories.
#   - Barrel resolution: importing a directory resolves to its index.ts re-exports.
#   - Event-bus-subscriber awareness: providers wired via pub/sub (OnModuleInit +
#     .subscribe()) are recognised as connected, not orphaned by absent DI references.
#
# If someone is tempted to simplify this later — to drop barrel resolution, to
# switch back to a directory-boundary heuristic, to remove event-bus awareness —
# the comment above is why that won't work. The failures are recorded below.
#
# check-orphans.sh — find implementation modules unreachable from production entrypoints.
#
# An orphan is a module that NOTHING in the production import graph reaches — no
# importer anywhere, inside or outside its directory, following barrel re-exports,
# excluding test files. This is the opposite of "no importer outside the feature
# directory": a module used only within its own feature is NORMAL and CORRECT.
#
# Coverage:
#   apps/mobile: BFS from App.tsx + index.ts, following all relative imports
#                (including import type), resolving barrels (index.ts re-exports).
#                Any .ts/.tsx under the package with exports but unreachable
#                is flagged.
#   apps/api:    NestJS providers declared in a module but never injected by
#                any controller or other provider (class-name grep).
#                Event-bus subscribers (OnModuleInit + .subscribe()) are
#                recognised as wired via pub/sub, not DI.
#
# Exits non-zero when orphans are found.
#
# Allowlist: tools/.orphans-allow — one filename per line; comments with #
# Each entry MUST have a # REASON comment explaining WHY it is exempt.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ALLOW="$SCRIPT_DIR/.orphans-allow"
FOUND=0

# ── Helpers ──────────────────────────────────────────────────────────────────

is_test() {
  local f="$1"
  [[ "$f" == *__tests__* ]] && return 0
  [[ "$f" == *.test.* ]] && return 0
  [[ "$f" == *.spec.* ]] && return 0
  return 1
}

is_allowed() {
  local candidate="$1"
  [ -f "$ALLOW" ] && grep -qxF "$candidate" "$ALLOW" 2>/dev/null && return 0
  return 1
}

# Normalize a relative path: collapse ../ and ./ components, strip leading ./,
# then re-add ./ prefix.  Uses Python os.path.normpath (available on macOS + CI).
normalize() {
  python3 -c "import os,sys; print('./' + os.path.normpath(sys.argv[1]).lstrip('/'))" "$1"
}

###############################################################################
# check_mobile — reachability from production entrypoints (App.tsx, index.ts)
###############################################################################
check_mobile() {
  local MOBILE_ROOT="$REPO_ROOT/apps/mobile"
  if [ ! -d "$MOBILE_ROOT" ]; then
    echo "SKIP — apps/mobile not found"
    return 0
  fi

  cd "$MOBILE_ROOT" || return 1

  local ENTRYPOINTS=("./App.tsx" "./index.ts")
  local GRAPH VISITED QUEUE QUEUE_NEXT
  GRAPH=$(mktemp)
  VISITED=$(mktemp)
  QUEUE=$(mktemp)
  QUEUE_NEXT=$(mktemp)
  # shellcheck disable=SC2064
  trap "rm -f $GRAPH $VISITED $QUEUE $QUEUE_NEXT" RETURN

  # ── Phase 1: Build import graph ──
  # For every .ts/.tsx (excluding node_modules, __tests__, test/spec files),
  # extract all relative import/export-from specs and resolve to actual files.

  local srcfile dir spec spec_clean resolved ext
  while IFS= read -r -d '' srcfile; do
    is_test "$srcfile" && continue

    dir=$(dirname "$srcfile")

    # Extract `from '…'` / `from "…"` and keep only relative paths (./ or ../).
    grep -oE "from ['\"][^'\"]*['\"]" "$srcfile" 2>/dev/null \
      | sed -E "s/from ['\"]([^'\"]*)['\"]/\1/" \
      | grep -E '^\.\.?/' \
    | while IFS= read -r spec; do
        spec_clean="${spec#./}"
        resolved=""

        # Try file.ts, file.tsx
        for ext in '.ts' '.tsx' '.d.ts'; do
          if [ -f "${dir}/${spec_clean}${ext}" ]; then
            resolved="${dir}/${spec_clean}${ext}"
            break
          fi
        done

        # Try directory/index.ts, index.tsx (barrel)
        if [ -z "$resolved" ]; then
          for ext in '.ts' '.tsx'; do
            if [ -f "${dir}/${spec_clean}/index${ext}" ]; then
              resolved="${dir}/${spec_clean}/index${ext}"
              break
            fi
          done
        fi

        if [ -n "$resolved" ] && ! is_test "$resolved"; then
          resolved=$(normalize "$resolved")
          echo "${srcfile}|${resolved}"
        fi
      done >> "$GRAPH"
  done < <(find . -type f \( -name '*.ts' -o -name '*.tsx' \) \
    -not -path '*/node_modules/*' -not -path '*/__tests__/*' \
    -not -path '*/__mocks__/*' -not -path './modules/*' -print0)

  # ── Phase 2: BFS from entrypoints ──

  > "$VISITED"
  > "$QUEUE"

  local ep
  for ep in "${ENTRYPOINTS[@]}"; do
    if [ -f "$ep" ]; then
      echo "$ep" >> "$QUEUE"
    fi
  done

  local current target
  while [ -s "$QUEUE" ]; do
    > "$QUEUE_NEXT"

    while IFS= read -r current; do
      [ -z "$current" ] && continue
      grep -qxF "$current" "$VISITED" 2>/dev/null && continue
      echo "$current" >> "$VISITED"

      # Follow all outgoing edges (including barrel re-exports).
      grep -F "${current}|" "$GRAPH" 2>/dev/null | cut -d'|' -f2 \
      | while IFS= read -r target; do
          grep -qxF "$target" "$VISITED" 2>/dev/null && continue
          grep -qxF "$target" "$QUEUE_NEXT" 2>/dev/null && continue
          echo "$target"
        done >> "$QUEUE_NEXT"
    done < "$QUEUE"

    # Swap: QUEUE_NEXT becomes QUEUE for the next iteration.
    cat "$QUEUE_NEXT" > "$QUEUE"
  done

  # ── Phase 3: Flag unreached exported modules ──

  local has_export fname
  while IFS= read -r -d '' srcfile; do
    is_test "$srcfile" && continue

    # Barrels are infrastructure; a barrel with only re-exports that nobody
    # imports is a dead export surface, but not an orphan in the same sense.
    [[ "$srcfile" == */index.ts || "$srcfile" == */index.tsx ]] && continue

    # A file with no exports cannot be orphaned — it has nothing to wire.
    has_export=$(grep -cE '^export (function|class|const|let|async function|interface|type|enum)' "$srcfile" 2>/dev/null | tr -d '[:space:]')
    [ -z "$has_export" ] && has_export=0
    if [ "${has_export:-0}" -eq 0 ]; then
      continue
    fi

    # Allowlist
    fname=$(basename "$srcfile" | sed -E 's/\.[jt]sx?$//')
    is_allowed "mobile:$fname" && continue

    if ! grep -qxF "$srcfile" "$VISITED" 2>/dev/null; then
      echo "ORPHAN mobile:${srcfile#./} — unreachable from entrypoints"
      FOUND=$((FOUND + 1))
    fi
  done < <(find . -type f \( -name '*.ts' -o -name '*.tsx' \) \
    -not -path '*/node_modules/*' -not -path '*/__tests__/*' \
    -not -path '*/__mocks__/*' -not -path './modules/*' -print0)
}

###############################################################################
# check_api — NestJS providers that are never injected
###############################################################################
check_api() {
  local API_ROOT="$REPO_ROOT/apps/api"
  if [ ! -d "$API_ROOT" ]; then
    echo "SKIP — apps/api not found"
    return 0
  fi

  cd "$API_ROOT/src" || return 1

  local module_files mod mod_dir providers_raw provider provider_file
  local external_refs real_refs ref

  # Find all NestJS module files
  module_files=$(find . -name '*.module.ts' -type f 2>/dev/null)

  for mod in $module_files; do
    mod_dir=$(dirname "$mod")
    [ ! -f "$mod" ] && continue

    # ── Parse providers array from the module (multi-line aware) ──
    # Extract the providers: [...] block spanning multiple lines,
    # then pull PascalCase class names from it.
    providers_raw=$(awk '/providers:/{p=1} p{print} /\]/{if(p){print; exit}}' "$mod" 2>/dev/null \
      | grep -oE '\b[A-Z][A-Za-z0-9]+\b' \
      | sort -u)

    if [ -z "$providers_raw" ]; then
      continue
    fi

    for provider in $providers_raw; do
      # ── Skip allowlisted entries ──
      is_allowed "api:$provider" && continue

      # ── Skip framework-level tokens (never "orphaned" — they're DI tokens) ──
      [[ "$provider" == PUSH_TRANSPORT ]] && continue

      # ── Skip NestJS @Module classes themselves ──
      if echo "$provider" | grep -qE '^[A-Z][a-z]+Module$' 2>/dev/null; then
        continue
      fi

      # ── Find the file that defines this provider class ──
      provider_file=$(grep -rl "export class $provider" "$mod_dir" --include='*.ts' 2>/dev/null | head -1)

      # ── Check if this is a controller (framework-invoked, never orphaned) ──
      if [ -n "$provider_file" ] && grep -q '@Controller' "$provider_file" 2>/dev/null; then
        continue
      fi

      # ── Check if this is an event-bus subscriber (wired via pub/sub, not DI) ──
      # Event-bus subscribers call .subscribe() on a Redis/pubsub client during
      # OnModuleInit. They are never directly injected — the event bus reaches them.
      if [ -n "$provider_file" ] && grep -qE '(OnModuleInit|subscribe\()' "$provider_file" 2>/dev/null; then
        # Both patterns must be present to avoid false positives on
        # unrelated .subscribe() calls (RxJS, etc.).
        if grep -q 'OnModuleInit' "$provider_file" 2>/dev/null && \
           grep -qE '\.subscribe\(' "$provider_file" 2>/dev/null; then
          continue
        fi
      fi

      # ── Skip if no definition file found (might be a barrel re-export or external) ──
      if [ -z "$provider_file" ]; then
        continue
      fi

      # ── Check production references OUTSIDE the class definition file ──
      # A provider is "wired" if ANY non-test file OTHER THAN its own
      # definition file and its module declaration references it.
      # Controllers in the same directory count as valid consumers.
      external_refs=""
      # provider_file is e.g. "./push/push-dispatch.service.ts"
      # mod is e.g. "./push/push.module.ts"
      # Exclude both the class definition file and the module declaration file.
      external_refs=$(grep -rl "\b$provider\b" . --include='*.ts' 2>/dev/null \
        | grep -v "^${provider_file}$" \
        | grep -v "^$mod$")

      # Filter out test files from external refs
      real_refs=""
      if [ -n "$external_refs" ]; then
        while IFS= read -r ref; do
          is_test "$ref" && continue
          real_refs="${real_refs:+$real_refs$'\n'}$ref"
        done <<< "$external_refs"
      fi

      if [ -z "$real_refs" ]; then
        echo "ORPHAN api:${mod_dir#./}/ → $provider — declared in module but never injected"
        FOUND=$((FOUND + 1))
      fi
    done
  done
}

###############################################################################
# Main
###############################################################################
echo "── apps/mobile ──"
check_mobile

echo "── apps/api ──"
check_api

###############################################################################
# Report
###############################################################################
if [ "$FOUND" -eq 0 ]; then
  echo "OK — every module is wired to a production consumer"
else
  echo ""
  echo "$FOUND orphaned module(s) found."
fi
exit "$FOUND"
