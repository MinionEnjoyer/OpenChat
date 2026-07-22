# devctl — OpenChat Dev Stack Manager

`tools/devctl` is the single entry point for all OpenChat dev environment operations:
stack lifecycle, verification gates, artifact validation, and safe commits.

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

If `<layer>` given, runs only that gate.

Exit 0 if all pass, 1 if any fails.

JSON (with `--json`): `{"doctor":"pass","health":"pass","codegen":"pass","contract":"pass","char":"pass","overall":"pass"}`

### `selftest`
Deliberately breaks one thing per layer (doctor, contract, char) and asserts the
corresponding gate fails with nonzero exit. **Mutates test files — NOT wired into
CI or verify.**

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
| selftest | All layers caught | Any layer missed |
| commit | Commit succeeded | Tree dirty or git failure |

## Doctor Coverage

`devctl doctor` checks for the presence of this README (`tools/devctl-README.md`).

## Related Documents

- `docs/audits/artifact-inventory.md` — required artifacts
- `docs/DRIFT-LOG.md` — deviations and findings
- `specs/05-AGENT-OPERATIONS.md` — agent authority and rules