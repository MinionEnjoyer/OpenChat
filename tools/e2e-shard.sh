#!/usr/bin/env bash
# e2e-shard.sh <shard-index> <shard-count> <device-serial>
#
# Runs a deterministic SLICE of the Maestro flow suite on ONE device, so N devices
# can run N shards concurrently. Maestro drives a single device at a time, so the
# only way to parallelise UI tests is to shard the suite across devices.
#
# Deterministic slicing (sorted list, stride by shard count) means a given flow
# always lands on the same shard — a failure is reproducible on the same device
# rather than wandering between runs.
set -uo pipefail
IDX="${1:?usage: e2e-shard.sh <idx> <count> <serial>}"
CNT="${2:?}"; DEV="${3:?}"
cd "$(dirname "${BASH_SOURCE[0]}")/.."
source tools/env.sh 2>/dev/null || true
# Maestro is a JVM tool and resolves Java from its OWN environment: sourcing
# env.sh sets JAVA_HOME but does not EXPORT it, so maestro fails with
# "Unable to locate a Java Runtime" even though the JDK is installed.
export JAVA_HOME ANDROID_HOME
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

mapfile -t ALL < <(ls apps/mobile/e2e/flows/*.yaml | sort)
PASS=0; FAIL=0; FAILED=()
for i in "${!ALL[@]}"; do
  [ $(( i % CNT )) -eq "$IDX" ] || continue
  f="${ALL[$i]}"
  # --device pins the flow to this shard's device; without it Maestro picks one
  # arbitrarily and shards collide on the same handset.
  if maestro --device "$DEV" test "$f" > "/tmp/e2e-$(basename "$f" .yaml)-$DEV.log" 2>&1; then
    PASS=$((PASS+1)); echo "PASS $(basename "$f")"
  else
    FAIL=$((FAIL+1)); FAILED+=("$(basename "$f")"); echo "FAIL $(basename "$f")"
  fi
done
echo "--- shard $IDX/$CNT on $DEV: $PASS passed, $FAIL failed ---"
[ "$FAIL" -eq 0 ] || { printf 'failed: %s\n' "${FAILED[@]}"; exit 1; }
