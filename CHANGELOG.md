# Changelog

## 0.1.1 — 2026-10-11

Phase 1 hardening:

- **Snapshot guard:** changing your theme, font, or minimap by hand while a mood is active now refreshes the restore point — "MoodSense: Off" returns your latest setup, not a stale pre-mood one
- **Unit tests** (vitest, mocked VS Code API): profile resolution/fallbacks and the snapshot guard — 9 tests
- **Lint + CI:** ESLint (flat config) and a GitHub Actions pipeline — lint, compile, test on every push; package + upload the VSIX on version tags
- **F5 launch config** so a fresh clone runs without manual build steps
- Manual QA checklist at docs/QA.md


## 0.1.0 — 2026-10-11

First build, from the MoodSense PRD (MVP compression):

- Status-bar mood switcher with QuickPick: Focused, Relaxed, Tired, Energetic
- Mood profiles in settings (theme, font size, Zen, minimap, ambient track, break multiplier); defaults use built-in VS Code themes only
- Snapshot & restore: "MoodSense: Off" restores your pre-MoodSense setup exactly
- Layout changes opt-in (`moodsense.applyLayoutChanges`); Focus Mode command for manual Zen
- Ambient player (webview) with three locally generated loops: deep, rain, wind
- Break reminders on a configurable timer with per-mood multipliers, snooze/dismiss/opt-out
- 100% local: no telemetry, no network, no accounts
