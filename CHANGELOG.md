# Changelog

## 0.1.0 — 2026-10-11

First build, from the MoodSense PRD (MVP compression):

- Status-bar mood switcher with QuickPick: Focused, Relaxed, Tired, Energetic
- Mood profiles in settings (theme, font size, Zen, minimap, ambient track, break multiplier); defaults use built-in VS Code themes only
- Snapshot & restore: "MoodSense: Off" restores your pre-MoodSense setup exactly
- Layout changes opt-in (`moodsense.applyLayoutChanges`); Focus Mode command for manual Zen
- Ambient player (webview) with three locally generated loops: deep, rain, wind
- Break reminders on a configurable timer with per-mood multipliers, snooze/dismiss/opt-out
- 100% local: no telemetry, no network, no accounts
