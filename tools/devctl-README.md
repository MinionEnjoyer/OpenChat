# devctl — OpenChat Dev Stack Manager

`tools/devctl` is the single entry point for all OpenChat dev environment operations:
stack lifecycle, verification gates, artifact validation, and safe commits.

This harness primarily covers the Compose/mobile specification lane. The repository's GitHub `CI`
workflow additionally runs the maintained API unit/characterization suite, web component tests and
build, LiveKit rotation/ICE probes, provider contracts, migration drift, dependency audits, and
gate self-tests. The Compose-backed API integration suite is currently probation evidence rather
than a trusted blocker.

## Invocation
```
./tools/devctl <command> [flags]
```

## Subcommands

### `stack up`
Start the dev stack: `docker compose -f docker-compose.dev.yml up --build -d`.
Exit 0 on success, nonzero on failure.

### `stack down`
Stop the dev stack. Exit 0 on success.

### `stack reset`
Tear down (incl. volumes) and bring up fresh: `down -v && up --build -d`.

### `stack logs`
Tail all service logs. Passes extra args to `docker compose logs`.

### `stack health [--json]`
Check postgres, redis, api, web, livekit, openshare, API health endpoint.

Exit code = number of failed services (0 = all healthy).

JSON (with `--json`): `{"postgres":"ok","redis":"ok","api":"ok","web":"ok","livekit":"ok","openshare":"ok","api_health":"ok"}`
Values: `"ok"`, `"unreachable"`, `"fail"`.

### `stack seed`
Run `tools/seed/seed.mjs`; produces `fixture-ids.json`. Exit 1 if seed fails.

### `doctor`
Assert every required artifact exists per `docs/audits/artifact-inventory.md`.
Checks `fixture-ids.json` freshness against Postgres container creation time.

Exit 0 if all present; exit 1 with JSON array of missing paths.

### `capabilities [--json]`
Validate `docs/capabilities/capabilities.json` evidence references resolve.
Exit 1 on errors. JSON: `{"errors":[...],"warnings":[...]}`.

### `verify [--json] [<layer>]`
Full Phase 0 verification suite in order:
0. doctor — required artifacts present
1. health — all services reachable
2. codegen — generated types match contracts
3. contract — provider + consumer contract tests (ajv-validated)
4. char — characterization tests
5. trace — every FR up to the current phase has an `@satisfies` annotation
6. nfr — NFR budgets + the phase ratchet (see `nfr` below)

If `<layer>` given, runs only that gate.

Exit 0 if all pass, 1 if any fails.

JSON (with `--json`): `{"doctor":"pass","health":"pass","codegen":"pass","contract":"pass","char":"pass","overall":"pass"}`

### `nfr [--json] [--only NFR-08]`
Runs every `tools/nfr/nfr-*.sh` and aggregates the results to
`artifacts/nfr/<sha>.json` (archive, per 04 §8) and `artifacts/nfr/report.json`
(latest-run pointer).

Each script reports one of four statuses:

| Status | Meaning | Gates? |
|---|---|---|
| `armed` | measured for real; `pass` decides | yes |
| `blocked` | not measurable yet, and `.phase` has not passed `arm_at_phase` | no |
| `overdue` | `.phase` is past `arm_at_phase` with no (or partial) measurement | yes — fails |
| `error` | the script itself crashed or emitted unparseable JSON | yes — fails |

The point of `arm_at_phase` is that a blocked stub cannot stay green forever. Each
script names the phase during which its budget must become real; once `.phase`
moves past it, the stub reports `overdue` and the gate goes red on its own. A
blocked entry also carries an `evidence` object of facts observed at run time
(is there an APK? does `apps/mobile/tsconfig.json` exist?) rather than a prose
claim that nothing rechecks. See `tools/nfr/lib.sh` for the protocol and the
comment block at the top of each script for its phase rationale.

Exit 0 if nothing is armed-failing, overdue, or errored; 1 otherwise.

### `screenshot --screen <name>`
Captures the connected emulator's screen to `artifacts/e2e/screens/<name>.png`
(06 §7). Verifies the PNG magic bytes and deletes the file if they are wrong —
a zero-byte or truncated capture must not look like a successful run.

Requires a connected emulator (`devctl device up`). Exit 1 if no device, if
`adb screencap` fails, or if the result is not a PNG.

### `selftest`
Deliberately breaks one thing per layer (doctor, contamination, contract, char,
trace, nfr) and asserts the corresponding gate fails with nonzero exit.
**Mutates test files and `.phase` — NOT wired into CI or verify.**

Exit 0 if all layers caught injected faults, 1 if any missed.

### `commit`
Fail if working tree is dirty. Warns about untracked files. Passes through to `git commit`.
Exit 1 if tree dirty (aborts), otherwise git commit exit code.

## Exit Codes

| Command | 0 | 1 |
|---|---|---|
| stack up/down/reset/logs | Success | Docker failure |
| stack health | All healthy | N failures = exit code N |
| stack seed | Seed complete | Seed failed |
| doctor | All present | Missing artifacts (JSON list) |
| capabilities | All valid | Errors found |
| verify | All gates pass | Any gate failed |
| nfr | No breach, overdue, or error | Any breach, overdue NFR, or script error |
| screenshot | PNG artifact written | No device, capture failed, or not a PNG |
| selftest | All layers caught | Any layer missed |
| commit | Commit succeeded | Tree dirty or git failure |

## Doctor Coverage

`devctl doctor` checks for the presence of this README (`tools/devctl-README.md`).

## Architecture: Dev Stack vs Emulator

The dev stack (API, Postgres, Redis, LiveKit, OpenShare, web) runs in **Docker**
via `docker compose`. These are container-level commands:

- `devctl stack up` / `down` / `reset` / `logs` / `health` / `seed`

The Android emulator runs on the **host**, not in a container. Nested
virtualization is unavailable on macOS, so `device` and `e2e` are host-level
commands:

- `devctl device up` — boots emulators on the host via HVF (macOS) or KVM (Linux)
- `devctl e2e` — runs Maestro flows against host emulators

### How the emulator reaches the API

The dev stack publishes ports on the Docker host (localhost:3001, :3000, etc.).
From inside an Android emulator, `10.0.2.2` resolves to the host machine's
loopback. Set `API_BASE_URL=http://10.0.2.2:3001` in E2E builds.

### Host-specific image selection

`device-up.sh` auto-detects the host OS and architecture:

| Host | Virt | System image |
|------|------|-------------|
| macOS/arm64 (Apple Silicon) | HVF | `system-images;android-34;google_apis;arm64-v8a` |
| macOS/x86_64 | HVF | `system-images;android-34;google_apis;x86_64` |
| Linux/x86_64 (CI) | KVM | `system-images;android-34;google_apis;x86_64` |
| Linux/aarch64 | KVM | `system-images;android-34;google_apis;arm64-v8a` |
| Other | — | Unsupported, exits 1 with reason |

### Two-emulator rig

Two instances share a single AVD. The second emulator uses `-read-only` to
share the AVD disk image. RAM cost per instance is ~6 GB on macOS/arm64 with
`-memory 2048`. Both must fit comfortably in host RAM.

### Pinned tool versions

| Tool | Version | Install |
|------|---------|---------|
| Java | openjdk@17 | `brew install openjdk@17` |
| Android cmdline-tools | 11076708 (12.0) | `tools/setup-android-toolchain.sh` |
| Platform tools | 35.0.2 | `sdkmanager 'platform-tools'` |
| Emulator | 36.6.11 | `sdkmanager 'emulator'` |
| System image | API 34 arm64-v8a | `sdkmanager 'system-images;android-34;google_apis;arm64-v8a'` |
| Maestro | 2.7.0 | `curl -Ls 'https://get.maestro.mobile.dev' \| bash` |

## Related Documents

- `docs/audits/artifact-inventory.md` — required artifacts
- `docs/DRIFT-LOG.md` — deviations and findings
- `specs/05-AGENT-OPERATIONS.md` — agent authority and rules
- `tools/setup-android-toolchain.sh` — one-shot toolchain install for macOS/arm64
