# DR-005 — Phone Layout: Custom Drawers via react-native-gesture-handler + reanimated

**Status:** Accepted  
**Date:** 2026-07-25  
**Author:** P3-T1 (autonomous per HANDOFF-P3-P4.md)  
**Affects:** `apps/mobile/src/features/shell/screens/ShellScreen.tsx`

## Context

The handoff (HANDOFF-P3-P4.md, Task 1) requires replacing the current fixed
4-column layout with a phone-appropriate drawer-based layout:

- Chat pane full-width by default
- Left drawer (server rail + channel list) opens by left-edge swipe or hamburger
- Right drawer (members) opens by right-edge swipe or Members button
- KeyboardAvoidingView for composer

Two approved approaches are listed:
1. `react-native-gesture-handler` + `react-native-reanimated`
2. React Navigation's drawer navigator

06-ARCH-APP.md §1 pins React Navigation v7. It is **not installed** (an
undocumented deviation).

## Decision

Use `react-native-gesture-handler` + `react-native-reanimated` with a custom
drawer implementation. Do **not** install React Navigation.

## Rationale

1. **Preserve structure.** The app currently renders `ShellScreen` directly
   after login — no navigator exists. Installing React Navigation would require
   restructuring the entire app shell (navigator container, screen definitions,
   route params) for a single layout change. This is disproportionate.

2. **Expo-native dependencies.** Both `react-native-gesture-handler` and
   `react-native-reanimated` are Expo-supported (available via
   `npx expo install`). They are compatible with the current Expo SDK 57
   configuration and require no native build config changes beyond the standard
   Expo plugin registration.

3. **React Navigation is the right call — later.** When the app grows to
   multiple screens (settings, profile, server create, voice calls), React
   Navigation becomes necessary. A Decision Record at that point will install
   it with the full navigator hierarchy. Installing it now just for drawers
   would add ~10 deps and force a navigator abstraction that the app doesn't
   need yet.

4. **Gesture fidelity.** Using the gesture handler directly gives full control
   over drawer animation curves, edge sensitivity, and simultaneous-gesture
   handling (e.g., drawer swipe vs FlatList scroll), which React Navigation's
   drawer wraps opaquely.

## Consequences

- Two new dependencies: `react-native-gesture-handler`, `react-native-reanimated`
- `babel.config.js` needs the `react-native-reanimated/plugin` (last in plugin list)
- `GestureHandlerRootView` must wrap the app root
- `ShellScreen.tsx` rewritten (~250 lines → ~400 lines)
- `p1-01-devlogin-shell.yaml` E2E flow rewritten to assert drawer open/close
- React Navigation remains uninstalled; 06 §1 deviation documented here

## Alternatives considered

| Approach | Rejected because |
|----------|-----------------|
| React Navigation drawer | Would require installing ~10 packages, adding Navigator container, restructuring app shell — for one screen. Punt to when multiple screens exist. |
| Do nothing (keep 4-column) | Fails FR-APP-001 on phone: text wraps mid-word at ~450px. The handoff explicitly requires fixing this before any Phase 3/4 work. |
| Pure React Native Animated (no gesture lib) | No reliable edge-swipe detection; Animated API is imperative; reanimated's worklet-based animations run on the UI thread, critical for 60fps drawer gestures. |