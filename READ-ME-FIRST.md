# Use --only, do not run all 18 screens

The runner now supports a filter. Verify ONLY your screens:

    node tools/screen-readiness.mjs R52X105QZYY --only=roles-editor,notif-settings,invite-create,join-server

Running the full 18 takes ~9 minutes per cycle and re-tests screens three other
agents own. With --only it is ~2 minutes. Three other agents are working the
other screens in parallel — do not touch them, and do not touch any device
other than R52X105QZYY.

## VERIFIED by the architect — _go-shell.yaml

`pressBack` is NOT a valid Maestro command — it errors with
`Invalid Command: pressBack`. The valid one is `- back` (tested: "Press back... COMPLETED").
17-19 of your flows call `_go-shell.yaml`, so if it errors, they all fail for a reason
that has nothing to do with the screen under test.

Also: `_go-shell` in some worktrees dismisses overlays with percentage COORDINATE taps
(`point: '85%,50%'`). Coordinates do not port across densities — the Samsung tablet is
240dpi vs 420dpi emulators. Prefer `- back` and testID taps.

Root cause you can skip re-deriving (nav-c proved it): flows were doing
`scrollUntilVisible -> rail-server-Fixture Guild` to switch servers, but the app RESTORES
the last-selected server and the channel footer controls work on ANY active server.
The server switch was never needed — removing it is the fix, not adding more navigation.
