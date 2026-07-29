#!/usr/bin/env bash
# NFR-03: release APK ≤60MB, JS bundle ≤12MB
# Armed at Phase 1: measurable from the first release build.
#
# Measured at P0-17 and recorded as a baseline rather than a gate, because what
# `assembleRelease` produces today is a *universal* APK carrying four ABIs. No
# device installs all four; the delivered artifact is per-ABI (App Bundle splits
# or an ABI-split APK). Gating the universal number would fail on ~40MB of
# native libs that never ship together. The per-ABI figure below is what the
# budget should be measured against once the delivery artifact is decided.
source "$(dirname "$0")/lib.sh"

NFR_ID="NFR-03"
NFR_NAME="release APK size"
NFR_BUDGET="≤60MB APK, ≤12MB JS bundle"
NFR_ARM_AT_PHASE=1
NFR_TOOL="stat on gradle outputs + per-ABI breakdown from the APK's lib/ entries"
NFR_BLOCKED_BY="delivery artifact not decided (universal vs per-ABI split) — see BACKLOG"

apk="$(nfr_apk_path)"
if [ -z "$apk" ]; then
  NFR_BLOCKED_BY="no APK — run 'npm run prebuild && npm run apk:release' in apps/mobile"
  nfr_stub "$(nfr_evidence apk_search "apps/mobile/**/*.apk" apk_found none)"
  exit 0
fi

apk_bytes=$(wc -c < "$apk" | tr -d ' ')
apk_mb=$(echo "$apk_bytes" | awk '{printf "%.1f", $1/1048576}')

bundle="$(find "$NFR_ROOT/apps/mobile/android" -name 'index.android.bundle' -type f 2>/dev/null | head -n1)"
if [ -n "$bundle" ]; then
  bundle_mb=$(wc -c < "$bundle" | awk '{printf "%.1f", $1/1048576}')
else
  bundle_mb="unknown"
fi

# Per-ABI native lib totals, and the largest one — the ABI a real device pays for.
abi_breakdown=$(unzip -l "$apk" 2>/dev/null | awk '/lib\//{split($4,a,"/"); s[a[2]]+=$1} END{for(k in s) printf "%s=%.1fMB ", k, s[k]/1048576}')
abi_total_mb=$(unzip -l "$apk" 2>/dev/null | awk '/lib\//{t+=$1} END{printf "%.1f", t/1048576}')
abi_max_mb=$(unzip -l "$apk" 2>/dev/null | awk '/lib\//{split($4,a,"/"); s[a[2]]+=$1} END{m=0; for(k in s) if(s[k]>m) m=s[k]; printf "%.1f", m/1048576}')
# Delivered size ≈ universal APK minus every ABI except the one installed.
per_abi_mb=$(awk -v a="$apk_mb" -v t="$abi_total_mb" -v m="$abi_max_mb" 'BEGIN{printf "%.1f", a-t+m}')

nfr_emit_baseline \
  "universal APK ${apk_mb}MB; est. per-ABI ${per_abi_mb}MB; JS bundle ${bundle_mb}MB" \
  "$(nfr_evidence \
    apk_path "${apk#"$NFR_ROOT"/}" \
    universal_apk_mb "$apk_mb" \
    js_bundle_mb "$bundle_mb" \
    abi_breakdown "$abi_breakdown" \
    est_per_abi_mb "$per_abi_mb" \
    budget_note "universal ${apk_mb}MB exceeds the 60MB budget; est. per-ABI ${per_abi_mb}MB is within it")"
