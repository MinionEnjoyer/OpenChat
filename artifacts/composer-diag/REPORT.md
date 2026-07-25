# Composer Focus Diagnostic Report

**Date**: 2026-07-25 | **Emulator**: Pixel 6a API 34 (1080×2400) | **APK**: from twodevice-rig worktree

## Measurements

### Composer Node
- **resource-id**: `composer-input`
- **Class**: `android.widget.EditText` → `ReactEditText`
- **Bounds**: `[21,2280][750,2379]`
- **Center coordinates**: `(385, 2329)`
- **Initial state**: `focused=false`, `text="Message"` (placeholder), `clickable=true`, `enabled=true`

### Tap Test (adb shell input tap 385 2329)
| State | focused | text | Keyboard |
|-------|---------|------|----------|
| Before tap | false | "Message" | hidden |
| After tap | **true** | "Message" | **visible** (mInputShown=true) |
| After text input | **true** | **"TestMsg123"** | visible |

**Result: Tap successfully focuses the composer.**

### Text Input Test
`adb shell input text "TestMsg123"` → text appeared in composer. Verified via uiautomator dump.
**Result: Text input works after focus.**

### Overlay Audit
9 full-screen ViewGroups found in hierarchy. All have `clickable=false`.

Two relevant overlays at RN root level (depth 8):
1. **Child[0]**: Anonymous `ViewGroup`, bounds `[0,0][1080,2400]`, 0 children, clickable=false
2. **Child[1]**: `shell-screen` (`KeyboardAvoidingView`), bounds `[0,0][1080,2400]`, 0 children, clickable=false

Source code confirms scrim uses `pointerEvents: 'none'` when invisible (opacity ≤ 0.01):
```tsx
pointerEvents: opacity > 0.01 ? 'auto' : 'none'
```

**Result: No clickable overlay covers the composer. Scrim is properly pointer-events-disabled when invisible.**

### Alternative Focus Methods
| Method | Command | Result |
|--------|---------|--------|
| DPAD_DOWN | `keyevent 20` ×3 | **failed** — composer not focused |
| ENTER key | `keyevent 66` | **failed** — composer not focused |
| Direct tap | `input tap 385 2329` | **success** |

### Back Navigation Pitfall
`adb shell input keyevent 4` (KEYCODE_BACK) navigates the app **back to the launcher** (not just dismissing the keyboard). This is a potential cause of user confusion — pressing Back to dismiss the keyboard exits the app entirely.

## Verdict

**This is an emulator/adb artifact, not a product defect.**

The composer accepts focus and text input correctly when tapped at the correct coordinates. The most likely causes of the original reported failure:

1. **Wrong coordinates**: If uiautomator bounds were parsed incorrectly or the tap was computed with wrong arithmetic, the tap could land outside the composer (e.g., on the non-clickable container at [0,2257][1080,2400] or on the nearby poll/send buttons).

2. **Timing race**: If the tap fires during app launch before the React Native tree is fully mounted, the composer node won't exist yet.

3. **Back key navigation**: If someone used `keyevent 4` (BACK) to dismiss the keyboard before retrying the tap, the app navigates to the launcher and the composer is gone.

4. **Keyboard already visible**: If the composer was already focused from a previous interaction, re-tapping appears to do nothing (the IME stays open, no visual change).

## Evidence Files

- `diag_01_initial.png` — Screen before tap (composer unfocused, no keyboard)
- `diag_02_tapped.png` — Screen after tap (keyboard visible)
- `diag_03_text_typed.png` — Screen after typing "TestMsg123" via adb
- `ui_initial.xml` — uiautomator dump before tap
- `ui_tapped.xml` — uiautomator dump after tap
- `ui_text_typed.xml` — uiautomator dump after text input
