# Work-order lessons — 2026-07-26

Observed across ~20 dispatches in one session. These are MY errors as dispatcher,
not agent quality problems.

## 1. COMMIT FIRST, always the opening instruction
Four agents step-capped with good work uncommitted (e2e-permgrant twice, vox-ui-fixes,
test-invalidation, notif-be-registry, notif-client). "Commit incrementally" as a closing
line does not land — by the time they read it they are out of steps.
Correct form: make step 1 of every work order "run tsc; if clean, commit NOW before
reading further." Something imperfect committed beats something good lost.

## 2. Work orders were consistently ~2x the step budget
Three consecutive agents capped mid-task. Split: one deliverable per dispatch.
Especially: separate WRITE-THE-FIX from PROVE-THE-FIX. Proving is open-ended device work;
the fix itself is often nine lines. e2e-permgrant burned 4h22m plus a continuation
because both were in one order.

## 3. Agents must NOT build APKs
Asking for device verification forces a per-agent gradle build. One agent was killed for
a stuck poll loop watching gradle. It also duplicates minutes of build per agent.
Architect builds ONCE centrally and runs a batched device pass over all merged fixes.
Agents end at code + unit tests + commit.

## 4. Never schedule two runs on one device
/tmp/e2e-verdicts-$DEV.txt is keyed by device only; concurrent runs interleave silently
and each reads as the other's failures. Assign an explicit device budget per agent, and
keep one device free for the architect.

## 5. Do not over-dispatch into a full fleet
Four diagnosis agents were evicted mid-run when later dispatches filled the concurrency
limit. They had already written 158 artifact files. Check live agent count first.

## 6. When a fix addresses a PATTERN, demand the full inventory
"List every other place this pattern occurs, even if you only fix it once" turned a single
PollCreate bug report into a ranked inventory of 7 more latent races plus a verified
not-affected list. Cheapest instruction of the day.

## 7. Division of labour is strict and runs both ways
Images (screenshots) -> architect only; agents cannot see them and must not describe them.
Text (uiautomator dumps, logcat, Maestro logs) -> agents only; they read and report in
words. The architect grepping a dump once nearly produced a wrong conclusion from a
capture of the Android launcher.
