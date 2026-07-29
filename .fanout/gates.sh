# OpenChat gate config (see ~/workspace/workflows/codewhale-fanout/BOOTSTRAP.md)
GATE_DIRS=("apps/mobile")
GATE_TYPECHECK="npx tsc --noEmit"
GATE_LINT="npx eslint . --max-warnings=0"
GATE_TEST="npx jest"
GATE_TEST_SUITES_MIN=25
GATE_TEST_COUNT_MIN=342
GATE_EXTRA=()
GATE_ENV=()
