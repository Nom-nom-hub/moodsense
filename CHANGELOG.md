# Changelog

## 0.3.0 — 2026-10-11

The ownership release — MoodSense is now yours to shape:

- **Visual mood editor in the panel:** create and edit moods without touching JSON — name, icon, accent color (swatches + custom picker), theme (picked from the themes you actually have installed), font size, ambient track, break rhythm, Zen/minimap, plus per-mood font family, line height, and cursor style under Typography & cursor
- **More environment per mood:** font family, line height, and cursor style now adapt with the mood — and Off restores them exactly (snapshot coverage extended, manual edits still refresh the restore point)
- **Accent colors are per-mood and yours** — the panel and active states follow your chosen hue
- **Export / Import moods:** copy your whole mood set as JSON from the panel footer, share it, import someone else's pack (validated + sanitized before it can touch settings)
- **Built-ins are protected:** edit them freely, reset them to defaults in one click; delete is for your own moods
- Commands added: Export Moods, Import Moods, Reset Moods to Defaults


## 0.2.1 — 2026-10-11

Design overhaul — remove the generated look:

- **Custom icon system:** hand-drawn 24px stroke icons (target, leaf, moon, bolt) replace all emoji — in the panel, and the emoji are gone from the status bar and mood picker too
- **Panel rebuilt as a disciplined row list** (Linear/Raycast pattern): icon tile in the mood's hue, label + spec line, active indicator dot — no card grid, no gradients, no glow
- **Segmented control** for ambient tracks; flat surfaces, hairline borders, 8pt spacing rhythm, radii tightened to 7–8px, transitions shortened to 120ms
- Profiles now carry an `icon` name instead of an emoji (existing custom profiles keep working; unknown icons fall back to a plain dot)


## 0.2.0 — 2026-10-11

The design release — MoodSense gets a face:

- **Control panel** in the Activity Bar: mood cards with per-mood signature colors that re-theme the whole panel, ambient transport (track chips, play/pause, volume), and a live break countdown with progress bar
- **Brand system:** activity-bar icon, marketplace icon, and a getting-started walkthrough (first mood → panel tour → snapshot safety → customize profiles)
- Ambient playback moved into the panel (single surface); the standalone player panel is gone
- Break timer now exposes its schedule so the panel countdown is live
- 13 unit tests (4 new for the panel state helpers)


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
