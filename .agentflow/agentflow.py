#!/usr/bin/env python3
"""Vendor-neutral execution ledger, queue, resource broker, and gate registry."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shlex
import signal
import sqlite3
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


TERMINAL_RUN_STATES = {"PASSED", "FAILED", "CRASHED", "TIMED_OUT", "CANCELLED", "SIGNALLED"}
ACTIVE_RUN_STATES = {"STARTING", "RUNNING", "STALLED"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def find_project(explicit: str | None = None) -> Path:
    if explicit:
        root = Path(explicit).expanduser().resolve()
        if not (root / ".agentflow").is_dir():
            raise SystemExit(f"not bootstrapped: {root}")
        return root
    current = Path.cwd().resolve()
    for candidate in (current, *current.parents):
        if (candidate / ".agentflow").is_dir():
            return candidate
    raise SystemExit("no .agentflow directory found; run bootstrap.py first")


def config(root: Path) -> dict[str, Any]:
    return json.loads((root / ".agentflow" / "config.json").read_text())


def connect(root: Path) -> sqlite3.Connection:
    state = root / ".agentflow" / "state.sqlite3"
    connection = sqlite3.connect(state, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA busy_timeout=30000")
    return connection


def init_db(root: Path) -> None:
    connection = connect(root)
    try:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS work_items (
              work_id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              deliverable TEXT NOT NULL,
              kind TEXT NOT NULL CHECK(kind IN ('implementation','diagnostic','verification','audit')),
              verifies_run_id TEXT,
              decides TEXT,
              state TEXT NOT NULL CHECK(state IN ('QUEUED','RUNNING','DONE','CANCELLED')),
              priority INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL,
              claimed_at TEXT,
              finished_at TEXT
            );
            CREATE TABLE IF NOT EXISTS work_resources (
              work_id TEXT NOT NULL REFERENCES work_items(work_id) ON DELETE CASCADE,
              resource TEXT NOT NULL,
              PRIMARY KEY(work_id, resource)
            );
            CREATE TABLE IF NOT EXISTS work_paths (
              work_id TEXT NOT NULL REFERENCES work_items(work_id) ON DELETE CASCADE,
              path TEXT NOT NULL,
              PRIMARY KEY(work_id, path)
            );
            CREATE TABLE IF NOT EXISTS runs (
              run_id TEXT PRIMARY KEY,
              work_id TEXT REFERENCES work_items(work_id),
              agent TEXT NOT NULL,
              model TEXT,
              worktree TEXT NOT NULL,
              branch TEXT,
              state TEXT NOT NULL,
              phase TEXT NOT NULL,
              started_at TEXT NOT NULL,
              heartbeat_at TEXT NOT NULL,
              finished_at TEXT,
              outcome TEXT,
              exit_code INTEGER,
              holder_pid INTEGER NOT NULL,
              command_hash TEXT NOT NULL,
              artifact_dir TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS run_resources (
              run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
              resource TEXT NOT NULL,
              PRIMARY KEY(run_id, resource)
            );
            CREATE TABLE IF NOT EXISTS events (
              sequence INTEGER PRIMARY KEY AUTOINCREMENT,
              run_id TEXT,
              work_id TEXT,
              at TEXT NOT NULL,
              event_type TEXT NOT NULL,
              payload_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS gates (
              name TEXT PRIMARY KEY,
              command_json TEXT NOT NULL,
              status TEXT NOT NULL CHECK(status IN ('PROBATION','TRUSTED','QUARANTINED')),
              defined_at TEXT NOT NULL,
              version INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS gate_receipts (
              receipt_id TEXT PRIMARY KEY,
              name TEXT NOT NULL REFERENCES gates(name),
              gate_version INTEGER NOT NULL,
              mode TEXT NOT NULL CHECK(mode IN ('normal','negative','positive')),
              started_at TEXT NOT NULL,
              finished_at TEXT NOT NULL,
              exit_code INTEGER NOT NULL,
              expectation_met INTEGER NOT NULL,
              duration_ms INTEGER NOT NULL,
              commit_sha TEXT,
              log_path TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS gate_adjudications (
              receipt_id TEXT PRIMARY KEY REFERENCES gate_receipts(receipt_id),
              classification TEXT NOT NULL CHECK(classification IN (
                'product_defect','harness_defect','infrastructure',
                'duplicate','expected_control','no_defect'
              )),
              defect_id TEXT,
              severity TEXT,
              note TEXT,
              adjudicated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS runs_state_idx ON runs(state);
            CREATE INDEX IF NOT EXISTS events_run_idx ON events(run_id, sequence);
            CREATE INDEX IF NOT EXISTS receipts_gate_idx ON gate_receipts(name, gate_version, started_at);
            CREATE TRIGGER IF NOT EXISTS events_no_update
              BEFORE UPDATE ON events
              BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
            CREATE TRIGGER IF NOT EXISTS events_no_delete
              BEFORE DELETE ON events
              BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
            CREATE TRIGGER IF NOT EXISTS receipts_no_update
              BEFORE UPDATE ON gate_receipts
              BEGIN SELECT RAISE(ABORT, 'gate receipts are append-only'); END;
            CREATE TRIGGER IF NOT EXISTS receipts_no_delete
              BEFORE DELETE ON gate_receipts
              BEGIN SELECT RAISE(ABORT, 'gate receipts are append-only'); END;
            CREATE TRIGGER IF NOT EXISTS adjudications_no_update
              BEFORE UPDATE ON gate_adjudications
              BEGIN SELECT RAISE(ABORT, 'gate adjudications are append-only'); END;
            CREATE TRIGGER IF NOT EXISTS adjudications_no_delete
              BEFORE DELETE ON gate_adjudications
              BEGIN SELECT RAISE(ABORT, 'gate adjudications are append-only'); END;
            """
        )
        columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(work_items)")
        }
        if "verifies_run_id" not in columns:
            connection.execute("ALTER TABLE work_items ADD COLUMN verifies_run_id TEXT")
        if "decides" not in columns:
            connection.execute("ALTER TABLE work_items ADD COLUMN decides TEXT")
        connection.commit()
    finally:
        connection.close()


def event(
    connection: sqlite3.Connection,
    event_type: str,
    *,
    run_id: str | None = None,
    work_id: str | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    connection.execute(
        "INSERT INTO events(run_id, work_id, at, event_type, payload_json) VALUES (?,?,?,?,?)",
        (run_id, work_id, utc_now(), event_type, json.dumps(payload or {}, sort_keys=True)),
    )


def git_value(root: Path, *args: str) -> str | None:
    try:
        return subprocess.check_output(
            ["git", "-C", str(root), *args],
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip() or None
    except (OSError, subprocess.CalledProcessError):
        return None


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def print_json(value: Any) -> None:
    print(json.dumps(value, indent=2, sort_keys=True))


def enqueue(args: argparse.Namespace, root: Path) -> int:
    resources = sorted(set(args.resource or []))
    paths = sorted(set(args.path or []))
    verifies_run_id = getattr(args, "verifies_run", None)
    if args.kind == "implementation" and any(item.startswith("device:") for item in resources):
        raise SystemExit(
            "implementation work cannot reserve a device; enqueue device proof as a separate verification item"
        )
    if verifies_run_id and args.kind not in {"verification", "audit"}:
        raise SystemExit("--verifies-run is valid only for verification or audit work")
    # Scarce-resource work must state, BEFORE dispatch, what a result would settle.
    #
    # gate-report already compares time spent against unique defects caught, but only
    # after the fact. That is too late to stop a queue being drained for its own sake:
    # in the originating project 64 device flows were run across a weekend and yielded
    # one real defect, while every other genuine defect that weekend came from a human
    # looking at a screen. Nothing refused the queue, because nothing asked what the
    # queue was for.
    #
    # The question is deliberately answered in prose and never parsed. Its value is
    # that an empty or circular answer is obvious to a reader, and that the claim is
    # recorded before the result is known — so gate-report can later put the predicted
    # value next to the observed yield.
    decides = (getattr(args, "decides", None) or "").strip()
    scarce = [item for item in resources if item.startswith("device:")]
    if scarce and not decides:
        raise SystemExit(
            "work reserving "
            + ", ".join(scarce)
            + " requires --decides: state what a pass or fail would tell you that you "
            "do not already know. If there is no answer, do not spend the device."
        )
    work_id = args.id or f"work-{uuid.uuid4().hex[:12]}"
    connection = connect(root)
    try:
        connection.execute("BEGIN IMMEDIATE")
        if verifies_run_id:
            target = connection.execute(
                "SELECT run_id FROM runs WHERE run_id=?", (verifies_run_id,)
            ).fetchone()
            if target is None:
                raise SystemExit(f"unknown run to verify: {verifies_run_id}")
        connection.execute(
            """
            INSERT INTO work_items(
              work_id,title,deliverable,kind,verifies_run_id,decides,state,priority,created_at
            ) VALUES (?,?,?,?,?,?, 'QUEUED', ?, ?)
            """,
            (
                work_id,
                args.title,
                args.deliverable,
                args.kind,
                verifies_run_id,
                decides or None,
                args.priority,
                utc_now(),
            ),
        )
        connection.executemany(
            "INSERT INTO work_resources(work_id,resource) VALUES (?,?)",
            [(work_id, resource) for resource in resources],
        )
        connection.executemany(
            "INSERT INTO work_paths(work_id,path) VALUES (?,?)",
            [(work_id, path) for path in paths],
        )
        event(
            connection,
            "WORK_ENQUEUED",
            work_id=work_id,
            payload={
                "kind": args.kind,
                "resources": resources,
                "paths": paths,
                "verifies_run_id": verifies_run_id,
            },
        )
        connection.commit()
    finally:
        connection.close()
    print_json({"work_id": work_id, "state": "QUEUED"})
    return 0


def held_resources(connection: sqlite3.Connection) -> set[str]:
    rows = connection.execute(
        """
        SELECT rr.resource
        FROM run_resources rr JOIN runs r ON r.run_id=rr.run_id
        WHERE r.state IN ('STARTING','RUNNING','STALLED')
        """
    ).fetchall()
    return {row["resource"] for row in rows}


def validate_device_boundary(
    cfg: dict[str, Any], resources: list[str], command: list[str]
) -> None:
    device_resources = [item for item in resources if item.startswith("device:")]
    explicit_device_driver = Path(command[0]).name in {"adb", "maestro", "xcrun"}
    if explicit_device_driver and not device_resources:
        raise SystemExit("raw device command requires a declared device:* resource and broker")
    if not device_resources:
        return
    broker = cfg.get("device_broker", {})
    prefix = broker.get("command_prefix", [])
    if broker.get("required", True) and not prefix:
        raise SystemExit(
            "device work requires a configured mandatory broker command_prefix"
        )
    if prefix and command[: len(prefix)] != prefix:
        raise SystemExit(
            "device work command does not enter through the configured broker boundary"
        )


def eligible_queue(connection: sqlite3.Connection) -> list[sqlite3.Row]:
    held = held_resources(connection)
    rows = connection.execute(
        "SELECT * FROM work_items WHERE state='QUEUED' ORDER BY priority DESC, created_at, work_id"
    ).fetchall()
    eligible: list[sqlite3.Row] = []
    for row in rows:
        needed = {
            item["resource"]
            for item in connection.execute(
                "SELECT resource FROM work_resources WHERE work_id=?", (row["work_id"],)
            )
        }
        if not needed.intersection(held):
            eligible.append(row)
    return eligible


def status(args: argparse.Namespace, root: Path) -> int:
    connection = connect(root)
    try:
        active = [
            dict(row)
            for row in connection.execute(
                "SELECT * FROM runs WHERE state IN ('STARTING','RUNNING','STALLED') ORDER BY started_at"
            )
        ]
        queued = [dict(row) for row in eligible_queue(connection)]
        gates = [dict(row) for row in connection.execute("SELECT * FROM gates ORDER BY name")]
        counts = {
            row["state"]: row["n"]
            for row in connection.execute("SELECT state, COUNT(*) AS n FROM runs GROUP BY state")
        }
        maximum = int(config(root).get("max_parallel_agents", 1))
        unsaturated = bool(queued) and len(active) < maximum
        result = {
            "active": active,
            "eligible_queue": queued,
            "run_counts": counts,
            "gates": gates,
            "max_parallel_agents": maximum,
            "unsaturated": unsaturated,
        }
    finally:
        connection.close()
    if args.json:
        print_json(result)
    else:
        print(f"active={len(active)}/{maximum} eligible={len(queued)} unsaturated={str(unsaturated).lower()}")
        for run in active:
            print(
                f"{run['state']:8} {run['run_id']} {run['agent']} "
                f"{run['phase']} heartbeat={run['heartbeat_at']}"
            )
        for work in queued:
            print(f"QUEUED   {work['work_id']} {work['kind']} {work['title']}")
        for gate in gates:
            print(f"GATE     {gate['status']:11} {gate['name']} v{gate['version']}")
    return 3 if args.check_saturation and unsaturated else 0


def reserve_run(
    root: Path,
    *,
    work_id: str | None,
    agent: str,
    model: str | None,
    worktree: str,
    branch: str | None,
    phase: str,
    command: list[str],
    resources: list[str],
) -> tuple[str, Path]:
    cfg = config(root)
    connection = connect(root)
    run_id = f"run-{uuid.uuid4().hex}"
    run_dir = root / ".agentflow" / "runs" / run_id
    run_dir.mkdir(parents=True, mode=0o700)
    command_hash = hashlib.sha256(b"\0".join(os.fsencode(item) for item in command)).hexdigest()
    now = utc_now()
    try:
        connection.execute("BEGIN IMMEDIATE")
        active_count = connection.execute(
            "SELECT COUNT(*) AS n FROM runs WHERE state IN ('STARTING','RUNNING','STALLED')"
        ).fetchone()["n"]
        if active_count >= int(cfg.get("max_parallel_agents", 1)):
            raise SystemExit("parallel-agent capacity is full")
        collision = connection.execute(
            """
            SELECT run_id FROM runs
            WHERE worktree=? AND state IN ('STARTING','RUNNING','STALLED')
            """,
            (worktree,),
        ).fetchone()
        if collision:
            raise SystemExit(f"worktree already owned by {collision['run_id']}")
        held = held_resources(connection)
        conflict = sorted(set(resources).intersection(held))
        if conflict:
            raise SystemExit(f"resources already held: {', '.join(conflict)}")
        if work_id:
            work = connection.execute(
                "SELECT * FROM work_items WHERE work_id=?", (work_id,)
            ).fetchone()
            if work is None:
                raise SystemExit(f"unknown work item: {work_id}")
            if work["state"] != "QUEUED":
                raise SystemExit(f"work item is {work['state']}, not QUEUED")
            if work["verifies_run_id"]:
                target = connection.execute(
                    "SELECT agent,state FROM runs WHERE run_id=?",
                    (work["verifies_run_id"],),
                ).fetchone()
                if target is None:
                    raise SystemExit(f"verification target disappeared: {work['verifies_run_id']}")
                if target["state"] != "PASSED":
                    raise SystemExit(
                        f"verification target is {target['state']}, not PASSED"
                    )
                if target["agent"].strip().casefold() == agent.strip().casefold():
                    raise SystemExit(
                        "independent verification requires a different stable agent identity"
                    )
            declared = {
                row["resource"]
                for row in connection.execute(
                    "SELECT resource FROM work_resources WHERE work_id=?", (work_id,)
                )
            }
            resources = sorted(set(resources).union(declared))
            conflict = sorted(set(resources).intersection(held))
            if conflict:
                raise SystemExit(f"declared resources already held: {', '.join(conflict)}")
        validate_device_boundary(cfg, resources, command)
        if work_id:
            connection.execute(
                "UPDATE work_items SET state='RUNNING', claimed_at=? WHERE work_id=?",
                (now, work_id),
            )
        connection.execute(
            """
            INSERT INTO runs(
              run_id,work_id,agent,model,worktree,branch,state,phase,started_at,
              heartbeat_at,holder_pid,command_hash,artifact_dir
            ) VALUES (?,?,?,?,?,?, 'STARTING', ?,?,?,?,?,?)
            """,
            (
                run_id,
                work_id,
                agent,
                model,
                worktree,
                branch,
                phase,
                now,
                now,
                os.getpid(),
                command_hash,
                str(run_dir.relative_to(root)),
            ),
        )
        connection.executemany(
            "INSERT INTO run_resources(run_id,resource) VALUES (?,?)",
            [(run_id, resource) for resource in sorted(set(resources))],
        )
        event(
            connection,
            "RUN_CREATED",
            run_id=run_id,
            work_id=work_id,
            payload={
                "agent": agent,
                "model": model,
                "worktree": worktree,
                "branch": branch,
                "phase": phase,
                "resources": sorted(set(resources)),
                "command_hash": command_hash,
            },
        )
        connection.commit()
    except BaseException:
        connection.rollback()
        try:
            run_dir.rmdir()
        except OSError:
            pass
        raise
    finally:
        connection.close()
    return run_id, run_dir


def update_run(root: Path, run_id: str, *, state: str | None = None, phase: str | None = None) -> None:
    connection = connect(root)
    try:
        connection.execute("BEGIN IMMEDIATE")
        fields = ["heartbeat_at=?"]
        values: list[Any] = [utc_now()]
        if state:
            fields.append("state=?")
            values.append(state)
        if phase:
            fields.append("phase=?")
            values.append(phase)
        values.append(run_id)
        connection.execute(f"UPDATE runs SET {', '.join(fields)} WHERE run_id=?", values)
        event(
            connection,
            "RUN_HEARTBEAT" if not state else f"RUN_{state}",
            run_id=run_id,
            payload={"phase": phase} if phase else {},
        )
        connection.commit()
    finally:
        connection.close()


def terminalize(
    root: Path,
    run_id: str,
    *,
    state: str,
    exit_code: int | None,
    manifest_path: Path | None = None,
) -> None:
    if state not in TERMINAL_RUN_STATES:
        raise ValueError(state)
    now = utc_now()
    connection = connect(root)
    try:
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute("SELECT * FROM runs WHERE run_id=?", (run_id,)).fetchone()
        if row is None:
            raise SystemExit(f"unknown run: {run_id}")
        if row["state"] in TERMINAL_RUN_STATES:
            connection.rollback()
            return
        connection.execute(
            """
            UPDATE runs SET state=?, outcome=?, exit_code=?, heartbeat_at=?, finished_at=?
            WHERE run_id=?
            """,
            (state, state, exit_code, now, now, run_id),
        )
        if row["work_id"]:
            work_state = "DONE" if state == "PASSED" else "QUEUED"
            connection.execute(
                "UPDATE work_items SET state=?, finished_at=? WHERE work_id=?",
                (work_state, now if work_state == "DONE" else None, row["work_id"]),
            )
        event(
            connection,
            "RUN_TERMINAL",
            run_id=run_id,
            work_id=row["work_id"],
            payload={
                "outcome": state,
                "exit_code": exit_code,
                "manifest": str(manifest_path) if manifest_path else None,
            },
        )
        connection.commit()
    finally:
        connection.close()


def make_manifest(
    root: Path,
    run_id: str,
    run_dir: Path,
    command: list[str],
    state: str,
    exit_code: int | None,
) -> Path:
    files: list[dict[str, Any]] = []
    for path in sorted(run_dir.iterdir()):
        if path.is_file() and path.name != "manifest.json":
            files.append(
                {
                    "path": path.name,
                    "bytes": path.stat().st_size,
                    "sha256": hash_file(path),
                }
            )
    manifest = {
        "schema_version": 1,
        "run_id": run_id,
        "outcome": state,
        "exit_code": exit_code,
        "generated_at": utc_now(),
        "source_commit": git_value(root, "rev-parse", "HEAD"),
        "dirty": bool(git_value(root, "status", "--porcelain")),
        "executable": Path(command[0]).name,
        "command_sha256": hashlib.sha256(
            b"\0".join(os.fsencode(item) for item in command)
        ).hexdigest(),
        "files": files,
    }
    path = run_dir / "manifest.json"
    temporary = run_dir / "manifest.json.tmp"
    temporary.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    os.chmod(temporary, 0o600)
    temporary.replace(path)
    return path


def supervise(args: argparse.Namespace, root: Path) -> int:
    command = list(args.command)
    if command and command[0] == "--":
        command = command[1:]
    if not command:
        raise SystemExit("supervise requires a command after --")
    worktree = str(Path(args.worktree or root).expanduser().resolve())
    branch = args.branch or git_value(Path(worktree), "rev-parse", "--abbrev-ref", "HEAD")
    run_id, run_dir = reserve_run(
        root,
        work_id=args.work_id,
        agent=args.agent,
        model=args.model,
        worktree=worktree,
        branch=branch,
        phase=args.phase,
        command=command,
        resources=args.resource or [],
    )
    print_json({"run_id": run_id, "state": "STARTING", "artifact_dir": str(run_dir)})
    stdout_path = run_dir / "stdout.log"
    stderr_path = run_dir / "stderr.log"
    stdout_log = stdout_path.open("w", buffering=1)
    stderr_log = stderr_path.open("w", buffering=1)
    os.chmod(stdout_path, 0o600)
    os.chmod(stderr_path, 0o600)
    child: subprocess.Popen[str] | None = None
    stop = threading.Event()

    def pump(source: Any, destination: Any, mirror: Any) -> None:
        for line in iter(source.readline, ""):
            destination.write(line)
            if args.live:
                mirror.write(line)
                mirror.flush()
        source.close()

    def heartbeat() -> None:
        while not stop.wait(float(config(root).get("heartbeat_seconds", 10))):
            update_run(root, run_id)

    previous_handlers: dict[int, Any] = {}

    def forward(signum: int, _frame: Any) -> None:
        if child is not None and child.poll() is None:
            try:
                os.killpg(child.pid, signum)
            except (AttributeError, ProcessLookupError):
                child.send_signal(signum)

    try:
        child = subprocess.Popen(
            command,
            cwd=worktree,
            stdin=None,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            start_new_session=(os.name == "posix"),
        )
        update_run(root, run_id, state="RUNNING", phase=args.phase)
        for signum in (signal.SIGINT, signal.SIGTERM):
            previous_handlers[signum] = signal.signal(signum, forward)
        heartbeat_thread = threading.Thread(target=heartbeat, daemon=True)
        heartbeat_thread.start()
        out_thread = threading.Thread(
            target=pump, args=(child.stdout, stdout_log, sys.stdout), daemon=True
        )
        err_thread = threading.Thread(
            target=pump, args=(child.stderr, stderr_log, sys.stderr), daemon=True
        )
        out_thread.start()
        err_thread.start()
        try:
            exit_code = child.wait(timeout=args.timeout)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except (AttributeError, ProcessLookupError):
                child.terminate()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except (AttributeError, ProcessLookupError):
                    child.kill()
                child.wait()
            state = "TIMED_OUT"
            exit_code = child.returncode
        else:
            if exit_code == 0:
                state = "PASSED"
            elif exit_code < 0:
                state = "SIGNALLED"
            else:
                state = "FAILED"
        stop.set()
        out_thread.join(timeout=2)
        err_thread.join(timeout=2)
    except BaseException:
        stop.set()
        if child is not None and child.poll() is None:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except (AttributeError, ProcessLookupError):
                child.kill()
            child.wait()
        state = "CRASHED"
        exit_code = child.returncode if child is not None else None
        stdout_log.close()
        stderr_log.close()
        manifest_path = make_manifest(root, run_id, run_dir, command, state, exit_code)
        terminalize(root, run_id, state=state, exit_code=exit_code, manifest_path=manifest_path)
        raise
    finally:
        stop.set()
        for signum, handler in previous_handlers.items():
            signal.signal(signum, handler)
    stdout_log.close()
    stderr_log.close()
    manifest_path = make_manifest(root, run_id, run_dir, command, state, exit_code)
    terminalize(root, run_id, state=state, exit_code=exit_code, manifest_path=manifest_path)
    print_json({"run_id": run_id, "state": state, "exit_code": exit_code})
    return 0 if state == "PASSED" else (exit_code if exit_code and exit_code > 0 else 1)


def heartbeat_command(args: argparse.Namespace, root: Path) -> int:
    update_run(root, args.run_id, phase=args.phase)
    return 0


def reconcile(args: argparse.Namespace, root: Path) -> int:
    ttl = args.ttl or int(config(root).get("heartbeat_ttl_seconds", 120))
    now = datetime.now(timezone.utc)
    problems: list[str] = []
    connection = connect(root)
    try:
        connection.execute("BEGIN IMMEDIATE")
        active = connection.execute(
            "SELECT * FROM runs WHERE state IN ('STARTING','RUNNING','STALLED')"
        ).fetchall()
        for row in active:
            heartbeat_at = datetime.fromisoformat(row["heartbeat_at"])
            age = (now - heartbeat_at).total_seconds()
            if age <= ttl:
                continue
            alive = True
            try:
                os.kill(row["holder_pid"], 0)
            except (OSError, ProcessLookupError):
                alive = False
            if alive:
                connection.execute(
                    "UPDATE runs SET state='STALLED' WHERE run_id=?", (row["run_id"],)
                )
                event(
                    connection,
                    "RUN_STALLED",
                    run_id=row["run_id"],
                    work_id=row["work_id"],
                    payload={"heartbeat_age_seconds": int(age)},
                )
                problems.append(f"STALLED {row['run_id']} heartbeat_age={int(age)}s")
            else:
                terminal = utc_now()
                connection.execute(
                    """
                    UPDATE runs SET state='CRASHED', outcome='CRASHED', finished_at=?, heartbeat_at=?
                    WHERE run_id=?
                    """,
                    (terminal, terminal, row["run_id"]),
                )
                if row["work_id"]:
                    connection.execute(
                        "UPDATE work_items SET state='QUEUED', claimed_at=NULL WHERE work_id=?",
                        (row["work_id"],),
                    )
                event(
                    connection,
                    "RUN_RECOVERED_CRASH",
                    run_id=row["run_id"],
                    work_id=row["work_id"],
                    payload={"heartbeat_age_seconds": int(age)},
                )
                problems.append(f"CRASHED {row['run_id']} recovered")
        created = connection.execute("SELECT COUNT(*) AS n FROM runs").fetchone()["n"]
        terminal_count = connection.execute(
            "SELECT COUNT(*) AS n FROM runs WHERE state IN ('PASSED','FAILED','CRASHED','TIMED_OUT','CANCELLED','SIGNALLED')"
        ).fetchone()["n"]
        active_count = connection.execute(
            "SELECT COUNT(*) AS n FROM runs WHERE state IN ('STARTING','RUNNING','STALLED')"
        ).fetchone()["n"]
        if created != terminal_count + active_count:
            problems.append(
                f"CONSERVATION_BROKEN created={created} terminal={terminal_count} active={active_count}"
            )
        connection.commit()
    finally:
        connection.close()
    for problem in problems:
        print(problem)
    if not problems:
        print(f"OK created={created} terminal={terminal_count} active={active_count}")
    return 1 if problems else 0


def retire(args: argparse.Namespace, root: Path) -> int:
    connection = connect(root)
    try:
        connection.execute("BEGIN IMMEDIATE")
        work = connection.execute(
            "SELECT * FROM work_items WHERE work_id=?", (args.work_id,)
        ).fetchone()
        if work is None:
            raise SystemExit(f"unknown work item: {args.work_id}")
        active = connection.execute(
            """
            SELECT run_id FROM runs
            WHERE work_id=? AND state IN ('STARTING','RUNNING','STALLED')
            """,
            (args.work_id,),
        ).fetchone()
        if active:
            raise SystemExit(f"cannot retire work owned by active run {active['run_id']}")
        connection.execute(
            "UPDATE work_items SET state='CANCELLED',finished_at=? WHERE work_id=?",
            (utc_now(), args.work_id),
        )
        event(
            connection,
            "WORK_TOMBSTONED",
            work_id=args.work_id,
            payload={"previous_state": work["state"], "reason": args.reason},
        )
        connection.commit()
    finally:
        connection.close()
    print_json({"work_id": args.work_id, "state": "CANCELLED", "tombstone": args.reason})
    return 0


def export_evidence(args: argparse.Namespace, root: Path) -> int:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = (
        Path(args.output).expanduser().resolve()
        if args.output
        else root / ".agentflow" / "exports" / f"evidence-{stamp}-{uuid.uuid4().hex[:8]}"
    )
    output.mkdir(parents=True, exist_ok=False)
    connection = connect(root)
    try:
        connection.execute("BEGIN IMMEDIATE")
        try:
            display_output = str(output.relative_to(root))
        except ValueError:
            display_output = str(output)
        event(connection, "EVIDENCE_EXPORTED", payload={"output": display_output})
        connection.commit()

        work_items = []
        for row in connection.execute("SELECT * FROM work_items ORDER BY created_at,work_id"):
            item = dict(row)
            item["resources"] = [
                value["resource"]
                for value in connection.execute(
                    "SELECT resource FROM work_resources WHERE work_id=? ORDER BY resource",
                    (row["work_id"],),
                )
            ]
            item["paths"] = [
                value["path"]
                for value in connection.execute(
                    "SELECT path FROM work_paths WHERE work_id=? ORDER BY path",
                    (row["work_id"],),
                )
            ]
            work_items.append(item)

        runs = []
        for row in connection.execute("SELECT * FROM runs ORDER BY started_at,run_id"):
            item = dict(row)
            item["resources"] = [
                value["resource"]
                for value in connection.execute(
                    "SELECT resource FROM run_resources WHERE run_id=? ORDER BY resource",
                    (row["run_id"],),
                )
            ]
            manifest = root / row["artifact_dir"] / "manifest.json"
            item["manifest_sha256"] = hash_file(manifest) if manifest.is_file() else None
            runs.append(item)

        gates = []
        for row in connection.execute("SELECT * FROM gates ORDER BY name"):
            item = dict(row)
            item["receipts"] = [
                dict(receipt)
                for receipt in connection.execute(
                    """
                    SELECT * FROM gate_receipts
                    WHERE name=? ORDER BY started_at,receipt_id
                    """,
                    (row["name"],),
                )
            ]
            item["adjudications"] = [
                dict(adjudication)
                for adjudication in connection.execute(
                    """
                    SELECT ga.* FROM gate_adjudications ga
                    JOIN gate_receipts gr ON gr.receipt_id=ga.receipt_id
                    WHERE gr.name=? ORDER BY ga.adjudicated_at,ga.receipt_id
                    """,
                    (row["name"],),
                )
            ]
            gates.append(item)
        events = [
            dict(row) for row in connection.execute("SELECT * FROM events ORDER BY sequence")
        ]
    finally:
        connection.close()

    exports = {
        "work-items.json": json.dumps(work_items, indent=2, sort_keys=True) + "\n",
        "runs.json": json.dumps(runs, indent=2, sort_keys=True) + "\n",
        "gates.json": json.dumps(gates, indent=2, sort_keys=True) + "\n",
        "events.jsonl": "".join(json.dumps(item, sort_keys=True) + "\n" for item in events),
    }
    for name, content in exports.items():
        (output / name).write_text(content)
    manifest = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "project_commit": git_value(root, "rev-parse", "HEAD"),
        "files": [
            {
                "path": name,
                "bytes": (output / name).stat().st_size,
                "sha256": hash_file(output / name),
            }
            for name in sorted(exports)
        ],
    }
    (output / "export-manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    )
    print_json({"output": str(output), "files": len(exports) + 1})
    return 0


def gate_add(args: argparse.Namespace, root: Path) -> int:
    command = list(args.command)
    if command and command[0] == "--":
        command = command[1:]
    if not command:
        raise SystemExit("gate-add requires a command after --")
    connection = connect(root)
    try:
        connection.execute("BEGIN IMMEDIATE")
        current = connection.execute("SELECT * FROM gates WHERE name=?", (args.name,)).fetchone()
        version = 1 if current is None else current["version"] + 1
        connection.execute(
            """
            INSERT INTO gates(name,command_json,status,defined_at,version)
            VALUES (?,?,'PROBATION',?,?)
            ON CONFLICT(name) DO UPDATE SET
              command_json=excluded.command_json,
              status='PROBATION',
              defined_at=excluded.defined_at,
              version=excluded.version
            """,
            (args.name, json.dumps(command), utc_now(), version),
        )
        event(
            connection,
            "GATE_DEFINED",
            payload={"name": args.name, "version": version, "command": command},
        )
        connection.commit()
    finally:
        connection.close()
    print_json({"gate": args.name, "version": version, "status": "PROBATION"})
    return 0


def gate_run_one(root: Path, name: str, mode: str) -> tuple[dict[str, Any], bool]:
    connection = connect(root)
    gate = connection.execute("SELECT * FROM gates WHERE name=?", (name,)).fetchone()
    connection.close()
    if gate is None:
        raise SystemExit(f"unknown gate: {name}")
    command = json.loads(gate["command_json"])
    receipt_id = f"gate-{uuid.uuid4().hex}"
    gate_dir = root / ".agentflow" / "gates"
    gate_dir.mkdir(parents=True, exist_ok=True)
    log_path = gate_dir / f"{receipt_id}.log"
    started = utc_now()
    start_clock = time.monotonic()
    with log_path.open("w") as output:
        os.chmod(log_path, 0o600)
        proc = subprocess.run(
            command,
            cwd=root,
            stdin=subprocess.DEVNULL,
            stdout=output,
            stderr=subprocess.STDOUT,
            text=True,
            check=False,
        )
    duration_ms = int((time.monotonic() - start_clock) * 1000)
    finished = utc_now()
    expectation_met = proc.returncode != 0 if mode == "negative" else proc.returncode == 0
    connection = connect(root)
    try:
        connection.execute("BEGIN IMMEDIATE")
        connection.execute(
            """
            INSERT INTO gate_receipts(
              receipt_id,name,gate_version,mode,started_at,finished_at,exit_code,
              expectation_met,duration_ms,commit_sha,log_path
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                receipt_id,
                name,
                gate["version"],
                mode,
                started,
                finished,
                proc.returncode,
                int(expectation_met),
                duration_ms,
                git_value(root, "rev-parse", "HEAD"),
                str(log_path.relative_to(root)),
            ),
        )
        event(
            connection,
            "GATE_OBSERVED",
            payload={
                "name": name,
                "version": gate["version"],
                "receipt_id": receipt_id,
                "mode": mode,
                "exit_code": proc.returncode,
                "expectation_met": expectation_met,
            },
        )
        connection.commit()
    finally:
        connection.close()
    result = {
        "gate": name,
        "gate_status": gate["status"],
        "receipt_id": receipt_id,
        "mode": mode,
        "exit_code": proc.returncode,
        "expectation_met": expectation_met,
        "duration_ms": duration_ms,
        "log": str(log_path),
    }
    return result, expectation_met


def gate_run(args: argparse.Namespace, root: Path) -> int:
    result, expectation_met = gate_run_one(root, args.name, args.mode)
    print_json(result)
    return 0 if expectation_met else 1


def gate_promote(args: argparse.Namespace, root: Path) -> int:
    connection = connect(root)
    try:
        connection.execute("BEGIN IMMEDIATE")
        gate = connection.execute("SELECT * FROM gates WHERE name=?", (args.name,)).fetchone()
        if gate is None:
            raise SystemExit(f"unknown gate: {args.name}")
        receipts = connection.execute(
            """
            SELECT * FROM gate_receipts
            WHERE name=? AND gate_version=? AND expectation_met=1
            ORDER BY started_at, receipt_id
            """,
            (args.name, gate["version"]),
        ).fetchall()
        negatives = [row for row in receipts if row["mode"] == "negative"]
        positives = [row for row in receipts if row["mode"] in ("positive", "normal")]
        if not negatives or len(positives) < 2:
            raise SystemExit(
                "promotion requires one caught negative control and two passing positive/baseline runs"
            )
        connection.execute("UPDATE gates SET status='TRUSTED' WHERE name=?", (args.name,))
        event(
            connection,
            "GATE_PROMOTED",
            payload={
                "name": args.name,
                "version": gate["version"],
                "negative_receipt": negatives[-1]["receipt_id"],
                "positive_receipts": [row["receipt_id"] for row in positives[-2:]],
            },
        )
        connection.commit()
    finally:
        connection.close()
    print_json({"gate": args.name, "status": "TRUSTED", "version": gate["version"]})
    return 0


def gate_quarantine(args: argparse.Namespace, root: Path) -> int:
    connection = connect(root)
    try:
        connection.execute("BEGIN IMMEDIATE")
        changed = connection.execute(
            "UPDATE gates SET status='QUARANTINED' WHERE name=?", (args.name,)
        ).rowcount
        if not changed:
            raise SystemExit(f"unknown gate: {args.name}")
        event(
            connection,
            "GATE_QUARANTINED",
            payload={"name": args.name, "reason": args.reason},
        )
        connection.commit()
    finally:
        connection.close()
    print_json({"gate": args.name, "status": "QUARANTINED"})
    return 0


def gate_adjudicate(args: argparse.Namespace, root: Path) -> int:
    if args.classification == "product_defect" and not args.defect_id:
        raise SystemExit("product_defect adjudication requires --defect-id")
    connection = connect(root)
    try:
        connection.execute("BEGIN IMMEDIATE")
        receipt = connection.execute(
            "SELECT * FROM gate_receipts WHERE receipt_id=?", (args.receipt_id,)
        ).fetchone()
        if receipt is None:
            raise SystemExit(f"unknown gate receipt: {args.receipt_id}")
        connection.execute(
            """
            INSERT INTO gate_adjudications(
              receipt_id,classification,defect_id,severity,note,adjudicated_at
            ) VALUES (?,?,?,?,?,?)
            """,
            (
                args.receipt_id,
                args.classification,
                args.defect_id,
                args.severity,
                args.note,
                utc_now(),
            ),
        )
        event(
            connection,
            "GATE_ADJUDICATED",
            payload={
                "receipt_id": args.receipt_id,
                "gate": receipt["name"],
                "classification": args.classification,
                "defect_id": args.defect_id,
                "severity": args.severity,
            },
        )
        connection.commit()
    finally:
        connection.close()
    print_json(
        {
            "receipt_id": args.receipt_id,
            "classification": args.classification,
            "defect_id": args.defect_id,
        }
    )
    return 0


def gate_report(args: argparse.Namespace, root: Path) -> int:
    connection = connect(root)
    reports: list[dict[str, Any]] = []
    try:
        gate_query = "SELECT * FROM gates"
        parameters: tuple[Any, ...] = ()
        if args.name:
            gate_query += " WHERE name=?"
            parameters = (args.name,)
        gate_query += " ORDER BY name"
        for gate in connection.execute(gate_query, parameters):
            receipts = connection.execute(
                """
                SELECT gr.*,ga.classification,ga.defect_id,ga.severity
                FROM gate_receipts gr
                LEFT JOIN gate_adjudications ga ON ga.receipt_id=gr.receipt_id
                WHERE gr.name=? AND gr.gate_version=?
                ORDER BY gr.started_at,gr.receipt_id
                """,
                (gate["name"], gate["version"]),
            ).fetchall()
            normal = [row for row in receipts if row["mode"] == "normal"]
            failed = [row for row in normal if not row["expectation_met"]]
            defects = {
                row["defect_id"]
                for row in receipts
                if row["classification"] == "product_defect" and row["defect_id"]
            }
            total_ms = sum(row["duration_ms"] for row in receipts)
            reports.append(
                {
                    "gate": gate["name"],
                    "version": gate["version"],
                    "status": gate["status"],
                    "executions": len(receipts),
                    "execution_ms": total_ms,
                    "calibration_executions": len(receipts) - len(normal),
                    "normal_executions": len(normal),
                    "normal_failures": len(failed),
                    "unique_product_defects": len(defects),
                    "product_defect_ids": sorted(defects),
                    "harness_defects": sum(
                        row["classification"] == "harness_defect" for row in receipts
                    ),
                    "infrastructure_failures": sum(
                        row["classification"] == "infrastructure" for row in receipts
                    ),
                    "duplicates": sum(
                        row["classification"] == "duplicate" for row in receipts
                    ),
                    "unadjudicated_failures": sum(
                        row["classification"] is None for row in failed
                    ),
                    "ms_per_product_defect": (
                        total_ms // len(defects) if defects else None
                    ),
                }
            )
    finally:
        connection.close()
    if args.json:
        print_json(reports)
    else:
        for report in reports:
            ratio = (
                f"{report['ms_per_product_defect']}ms/defect"
                if report["ms_per_product_defect"] is not None
                else "no-product-defect-yet"
            )
            print(
                f"{report['status']:11} {report['gate']} v{report['version']} "
                f"runs={report['executions']} time_ms={report['execution_ms']} "
                f"defects={report['unique_product_defects']} {ratio} "
                f"unadjudicated_failures={report['unadjudicated_failures']}"
            )
    return 0


def gate_check(args: argparse.Namespace, root: Path) -> int:
    connection = connect(root)
    names = [
        row["name"]
        for row in connection.execute(
            "SELECT name FROM gates WHERE status='TRUSTED' ORDER BY name"
        )
    ]
    connection.close()
    if not names:
        print("NO_TRUSTED_GATES")
        return 2
    failed = False
    results = []
    for name in names:
        result, expectation_met = gate_run_one(root, name, "normal")
        results.append(result)
        failed = failed or not expectation_met
    print_json(results)
    return 1 if failed else 0


def unverified_implementation_runs(connection: sqlite3.Connection) -> list[sqlite3.Row]:
    return connection.execute(
        """
        SELECT r.run_id,w.work_id,r.agent,r.finished_at
        FROM runs r JOIN work_items w ON w.work_id=r.work_id
        WHERE r.state='PASSED' AND w.kind='implementation'
          AND NOT EXISTS (
            SELECT 1 FROM work_items verifier
            WHERE verifier.verifies_run_id=r.run_id
              AND verifier.kind IN ('verification','audit')
              AND verifier.state='DONE'
          )
        ORDER BY r.finished_at,r.run_id
        """
    ).fetchall()


def doctor(_args: argparse.Namespace, root: Path) -> int:
    issues: list[str] = []
    cfg = config(root)
    connection = connect(root)
    try:
        gates = connection.execute("SELECT status,COUNT(*) AS n FROM gates GROUP BY status").fetchall()
        gate_counts = {row["status"]: row["n"] for row in gates}
        if gate_counts.get("TRUSTED", 0) == 0:
            issues.append("no TRUSTED gates; calibrate negative and positive controls before delivery")
        active = connection.execute(
            "SELECT COUNT(*) AS n FROM runs WHERE state IN ('STARTING','RUNNING','STALLED')"
        ).fetchone()["n"]
        eligible = len(eligible_queue(connection))
        if eligible and active < int(cfg.get("max_parallel_agents", 1)):
            issues.append(f"fleet unsaturated: active={active} eligible={eligible}")
        stalled = connection.execute(
            "SELECT COUNT(*) AS n FROM runs WHERE state='STALLED'"
        ).fetchone()["n"]
        if stalled:
            issues.append(f"{stalled} stalled run(s)")
        if cfg.get("require_independent_verifier", True):
            unverified = unverified_implementation_runs(connection)
            if unverified:
                issues.append(
                    f"{len(unverified)} successful implementation run(s) lack independent proof"
                )
    finally:
        connection.close()
    if not git_value(root, "rev-parse", "--is-inside-work-tree"):
        issues.append("project is not a git worktree; branch isolation cannot be enforced")
    for issue in issues:
        print(f"ISSUE {issue}")
    if not issues:
        print("OK methodology controls are initialized")
    return 1 if issues else 0


def delivery_check(args: argparse.Namespace, root: Path) -> int:
    reconcile_result = reconcile(argparse.Namespace(ttl=args.ttl), root)
    issues: list[str] = []
    connection = connect(root)
    try:
        active = connection.execute(
            "SELECT COUNT(*) AS n FROM runs WHERE state IN ('STARTING','RUNNING','STALLED')"
        ).fetchone()["n"]
        queued = connection.execute(
            "SELECT COUNT(*) AS n FROM work_items WHERE state='QUEUED'"
        ).fetchone()["n"]
        trusted = connection.execute(
            "SELECT COUNT(*) AS n FROM gates WHERE status='TRUSTED'"
        ).fetchone()["n"]
        unverified = unverified_implementation_runs(connection)
    finally:
        connection.close()
    if reconcile_result:
        issues.append("reconciliation reported a stale or recovered run")
    if active:
        issues.append(f"{active} run(s) are still active")
    if queued:
        issues.append(f"{queued} work item(s) remain queued")
    if config(root).get("require_independent_verifier", True) and unverified:
        issues.append(f"{len(unverified)} implementation run(s) lack independent proof")
    if not trusted:
        issues.append("no TRUSTED gates exist")
    initial_commit = git_value(root, "rev-parse", "HEAD")
    if not initial_commit:
        issues.append("project has no git commit to gate")
    if config(root).get("require_clean_worktree", True) and git_value(
        root, "status", "--porcelain"
    ):
        issues.append("worktree is dirty; delivery evidence would not identify one source state")
    if issues:
        for issue in issues:
            print(f"BLOCKED {issue}")
        return 1

    gate_result = gate_check(argparse.Namespace(), root)
    if gate_result:
        print("BLOCKED trusted merged-result gate failed")
        return 1
    if git_value(root, "rev-parse", "HEAD") != initial_commit:
        print("BLOCKED a gate changed HEAD during delivery")
        return 1
    if config(root).get("require_clean_worktree", True) and git_value(
        root, "status", "--porcelain"
    ):
        print("BLOCKED a gate dirtied the worktree during delivery")
        return 1
    print(f"DELIVERY_READY commit={initial_commit}")
    return 0


def parser() -> argparse.ArgumentParser:
    top = argparse.ArgumentParser(description=__doc__)
    top.add_argument("--project", help="bootstrapped project root")
    commands = top.add_subparsers(dest="command_name", required=True)

    p = commands.add_parser("enqueue")
    p.add_argument("--id")
    p.add_argument("--title", required=True)
    p.add_argument("--deliverable", required=True)
    p.add_argument(
        "--kind",
        choices=("implementation", "diagnostic", "verification", "audit"),
        required=True,
    )
    p.add_argument("--priority", type=int, default=0)
    p.add_argument("--resource", action="append")
    p.add_argument("--path", action="append")
    p.add_argument("--verifies-run")
    p.add_argument(
        "--decides",
        help=(
            "what a pass or fail would settle that is not already known. "
            "Required when the item reserves a device:* resource."
        ),
    )
    p.set_defaults(handler=enqueue)

    p = commands.add_parser("status")
    p.add_argument("--json", action="store_true")
    p.add_argument("--check-saturation", action="store_true")
    p.set_defaults(handler=status)

    p = commands.add_parser("supervise")
    p.add_argument("--work-id")
    p.add_argument("--agent", required=True)
    p.add_argument("--model")
    p.add_argument("--worktree")
    p.add_argument("--branch")
    p.add_argument("--phase", default="execution")
    p.add_argument("--resource", action="append")
    p.add_argument("--timeout", type=float)
    p.add_argument("--live", action="store_true")
    p.add_argument("command", nargs=argparse.REMAINDER)
    p.set_defaults(handler=supervise)

    p = commands.add_parser("heartbeat")
    p.add_argument("--run-id", required=True)
    p.add_argument("--phase")
    p.set_defaults(handler=heartbeat_command)

    p = commands.add_parser("reconcile")
    p.add_argument("--ttl", type=int)
    p.set_defaults(handler=reconcile)

    p = commands.add_parser("retire")
    p.add_argument("--work-id", required=True)
    p.add_argument("--reason", required=True)
    p.set_defaults(handler=retire)

    p = commands.add_parser("export-evidence")
    p.add_argument("--output")
    p.set_defaults(handler=export_evidence)

    p = commands.add_parser("gate-add")
    p.add_argument("name")
    p.add_argument("command", nargs=argparse.REMAINDER)
    p.set_defaults(handler=gate_add)

    p = commands.add_parser("gate-run")
    p.add_argument("name")
    p.add_argument("--mode", choices=("normal", "negative", "positive"), default="normal")
    p.set_defaults(handler=gate_run)

    p = commands.add_parser("gate-promote")
    p.add_argument("name")
    p.set_defaults(handler=gate_promote)

    p = commands.add_parser("gate-quarantine")
    p.add_argument("name")
    p.add_argument("--reason", required=True)
    p.set_defaults(handler=gate_quarantine)

    p = commands.add_parser("gate-adjudicate")
    p.add_argument("receipt_id")
    p.add_argument(
        "--classification",
        required=True,
        choices=(
            "product_defect",
            "harness_defect",
            "infrastructure",
            "duplicate",
            "expected_control",
            "no_defect",
        ),
    )
    p.add_argument("--defect-id")
    p.add_argument("--severity")
    p.add_argument("--note")
    p.set_defaults(handler=gate_adjudicate)

    p = commands.add_parser("gate-report")
    p.add_argument("name", nargs="?")
    p.add_argument("--json", action="store_true")
    p.set_defaults(handler=gate_report)

    p = commands.add_parser("gate-check")
    p.set_defaults(handler=gate_check)

    p = commands.add_parser("doctor")
    p.set_defaults(handler=doctor)

    p = commands.add_parser("delivery-check")
    p.add_argument("--ttl", type=int)
    p.set_defaults(handler=delivery_check)
    return top


def main() -> int:
    args = parser().parse_args()
    root = find_project(args.project)
    init_db(root)
    return int(args.handler(args, root))


if __name__ == "__main__":
    raise SystemExit(main())
