#!/usr/bin/env bash
# check-orphans.sh — find implementation modules that are wired to NOTHING.
#
# A component or service can be fully implemented, correct, and comprehensively
# unit-tested while being completely unreferenced by any production code. Every
# unit test passes because every unit is right; the INTEGRATION between the
# module and the rest of the system has no owner and no test.
#
# This repo shipped a push notification feature with green specs on every
# component — push-dispatch.service.ts had zero call sites outside its own
# spec, and push.ts was imported only by its feature barrel + its own test.
# The integration did not exist. Nobody noticed until a human tested on a
# physical device.
#
# This gate covers BOTH sides:
#   apps/api:   NestJS providers declared in a module but never injected by
#               any controller or other provider.
#   apps/mobile: modules under src/features/** whose only production importers
#               are inside the same feature directory (barrel, sibling files).
#               An external consumer using the feature barrel is not enough —
#               the individual source file must have a direct external importer
#               to be considered wired.
#
# Exits non-zero when a non-trivial implementation module has no production
# reference outside its own directory + its own module declaration.
#
# Allowlist: tools/.orphans-allow — one filename per line; comments with #
# Each entry MUST have a # REASON comment explaining WHY it is exempt.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ALLOW="$SCRIPT_DIR/.orphans-allow"
FOUND_FILE=$(mktemp)
trap "rm -f $FOUND_FILE" EXIT
echo "0" > "$FOUND_FILE"

# Increment found counter (avoids subshell issues)
inc_found() {
  local n
  n=$(cat "$FOUND_FILE")
  echo $((n + 1)) > "$FOUND_FILE"
}

# ── Helper: check if a file is a test file ──
is_test() {
  local f="$1"
  [[ "$f" == *__tests__* ]] && return 0
  [[ "$f" == *.test.* ]] && return 0
  [[ "$f" == *.spec.* ]] && return 0
  return 1
}

# ── Helper: check if a candidate is allowlisted ──
is_allowed() {
  local candidate="$1"
  [ -f "$ALLOW" ] && grep -qxF "$candidate" "$ALLOW" 2>/dev/null && return 0
  return 1
}

###############################################################################
# PART 1: apps/api — NestJS providers that are never injected
###############################################################################
echo "── apps/api ──"

cd "$REPO_ROOT/apps/api/src" || exit 1

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
      inc_found
    fi
  done
done

###############################################################################
# PART 2: apps/mobile — unreferenced feature modules
###############################################################################
echo "── apps/mobile ──"

cd "$REPO_ROOT/apps/mobile/src" || exit 1

for feat_dir in features/*/; do
  [ ! -d "$feat_dir" ] && continue
  feat=$(basename "$feat_dir")

  # Collect all source files (not barrel, not test)
  src_files=$(find "$feat_dir" -maxdepth 1 \( -name '*.ts' -o -name '*.tsx' \) \
    ! -name 'index.ts' ! -name 'index.tsx' 2>/dev/null)

  if [ -z "$src_files" ]; then
    continue
  fi

  # Process each file (avoid pipe subshell for found counter)
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    is_test "$f" && continue

    fname=$(basename "$f" | sed -E 's/\.[jt]sx?$//')
    [ -z "$fname" ] && continue

    # ── Allowlist check ──
    is_allowed "mobile:$fname" && continue

    # ── Skip files with no exports (pure styles, config, side-effects only) ──
    has_export=$(grep -cE '^export (function|class|const|let|async function|interface|type|enum)' "$f" 2>/dev/null || echo "0")
    if [ "${has_export:-0}" -eq 0 ]; then
      continue
    fi

    # ── Check for direct importers OUTSIDE the feature directory ──
    # Search for import paths containing the filename across the entire src tree
    external_count=0
    importers=$(grep -rlE "from ['\"].*/${fname}['\"]" . --include='*.ts' --include='*.tsx' 2>/dev/null || true)

    if [ -n "$importers" ]; then
      while IFS= read -r importer; do
        [ -z "$importer" ] && continue
        is_test "$importer" && continue
        # Strip leading ./ for comparison; skip if inside same feature dir
        imp_norm="${importer#./}"
        [[ "$imp_norm" == "$feat_dir"* ]] && continue
        external_count=$((external_count + 1))
      done <<< "$importers"
    fi

    if [ "$external_count" -gt 0 ]; then
      continue  # wired
    fi

    # ── No external direct importers → ORPHAN ──
    echo "ORPHAN mobile:features/$feat/$fname — no direct importer outside features/$feat/"
    inc_found
  done <<< "$src_files"
done

###############################################################################
# Report
###############################################################################
found=$(cat "$FOUND_FILE")
if [ "$found" -eq 0 ]; then
  echo "OK — every module is wired to a production consumer"
else
  echo ""
  echo "$found orphaned module(s) found."
fi
exit "$found"
