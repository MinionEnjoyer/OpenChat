#!/usr/bin/env bash
# NFR-11: i18n readiness — user-facing strings go through the strings module.
# Armed at P0-17: the lint rule exists and apps/mobile has JSX to check.
source "$(dirname "$0")/lib.sh"

NFR_ID="NFR-11"
NFR_NAME="i18n readiness (no literal JSX strings)"
NFR_BUDGET="no literal JSX strings; all user-facing text via the strings module"
NFR_ARM_AT_PHASE=1
NFR_TOOL="eslint react/jsx-no-literals over apps/mobile"

cd "$NFR_ROOT/apps/mobile" || exit 1
set +e
out=$(npx eslint . --max-warnings=0 --format unix 2>&1)
set -e
# Count only this rule's violations; other lint failures belong to other gates.
violations=$(printf '%s' "$out" | grep -c 'jsx-no-literals' || true)

if [ "$violations" -eq 0 ]; then
  nfr_emit_armed "0 literal JSX strings" true \
    "$(nfr_evidence rule "react/jsx-no-literals (noStrings)" scope "apps/mobile" \
      strings_module "src/ui/strings.ts")"
else
  nfr_emit_armed "${violations} literal JSX string(s)" false \
    "$(nfr_evidence rule "react/jsx-no-literals (noStrings)" \
      first_violation "$(printf '%s' "$out" | grep 'jsx-no-literals' | head -n1)")"
fi
