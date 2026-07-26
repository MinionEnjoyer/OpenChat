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
  base="$(basename "$f" .yaml)"
  if maestro --device "$DEV" test "$f" > "/tmp/e2e-$base-$DEV.log" 2>&1; then
    PASS=$((PASS+1)); echo "PASS $base"
  else
    FAIL=$((FAIL+1)); FAILED+=("$base"); echo "FAIL $base"
    # Maestro's debug output contains only maestro.log — NO view hierarchy. Without
    # the hierarchy a failure is unactionable: you cannot tell a misspelled testID
    # from a genuinely absent element from a real product bug. Capture it here.
    adb -s "$DEV" shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
    adb -s "$DEV" pull /sdcard/ui.xml "/tmp/e2e-$base-$DEV-hierarchy.xml" >/dev/null 2>&1
    adb -s "$DEV" shell screencap -p /sdcard/s.png >/dev/null 2>&1
    adb -s "$DEV" pull /sdcard/s.png "/tmp/e2e-$base-$DEV-screen.png" >/dev/null 2>&1
    # The single most useful artifact: which testIDs ACTUALLY exist on screen right
    # now. A failing assertion plus this list usually makes the fix obvious.
    grep -oE 'resource-id="[^"]*"' "/tmp/e2e-$base-$DEV-hierarchy.xml" 2>/dev/null \
      | sed 's/resource-id="//;s/"$//' | grep -v '^$' | sort -u \
      > "/tmp/e2e-$base-$DEV-available-ids.txt"
    echo "     hierarchy: /tmp/e2e-$base-$DEV-hierarchy.xml"
    echo "     screenshot: /tmp/e2e-$base-$DEV-screen.png"
    echo "     ids on screen: /tmp/e2e-$base-$DEV-available-ids.txt"
  fi
done
echo "--- shard $IDX/$CNT on $DEV: $PASS passed, $FAIL failed ---"
[ "$FAIL" -eq 0 ] || { printf 'failed: %s\n' "${FAILED[@]}"; exit 1; }
