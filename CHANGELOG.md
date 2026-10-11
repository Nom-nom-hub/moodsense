# Changelog

## 0.5.0 — 2026-10-11

The "alive" release — MoodSense starts running itself, politely:

- **Time-of-day scheduling** (`moodsense.schedule` + `schedule.enabled`): moods switch at time boundaries — and only at boundaries, so a manual choice mid-window is respected until the next one. The panel shows "On schedule · … until HH:MM"
- **Quiet hours** (`moodsense.quietHours`): during the window, ambient mutes and reminders silently wait until it ends — no 11pm break buzz
- **Pomodoro mode** (`moodsense.pomodoro.*`): focus/break phases alternate on the timer, the panel countdown names the phase, and the soundscape pauses while you're on break
- **Track layering + crossfades:** every mood (and the panel) can run a second soundscape underneath the main one at lower volume; all track changes now crossfade over ~600ms instead of cutting
- **Mood history:** sessions are logged locally and the panel gains a "This week" view — time per mood over the last 7 days. Nothing leaves the machine; `MoodSense: Clear Mood History` wipes it
- **Routines** (`moodsense.routines`): one-click composites in the panel ("Good morning" → Energetic; "Deep work" → Focused + Focus Mode)
- **Status bar tint:** the status-bar item takes the active mood's accent color — state readable at a glance

Noted from the same review, honestly: quick-cycle shipped in 0.4.0 and
snapshot refresh in 0.1.1. Auto-pause on calls, OS Do-Not-Disturb sync,
and battery awareness have no VS Code extension API to build on, so they
are not faked with placebo toggles.


## 0.4.0 — 2026-10-11

The code-review release — closing the gaps an external review found (and
correcting the two that were already closed):

- **Break timer now starts on activation.** Before: it only started when a
  mood was already saved or first picked, so fresh installs never reminded.
  Now it runs on its default rhythm from startup; a mood still retunes it.
- **Your own audio.** Point `moodsense.ambient.customDirectory` at a folder
  of audio files (.ogg/.mp3/.wav/.m4a/.flac) and they appear in the panel
  under "Your audio" — playable immediately and assignable to any mood in
  the editor. Mood packs reference files by bare name only, so a shared
  pack can never point the player outside your folder.
- **Cycle Mood command + keybinding** (Ctrl+Alt+M / Cmd+Alt+M): step through
  your moods — built-ins first, then your customs — without opening anything.
- **BreakTimer is unit-tested now** (scheduling, multipliers, disabled
  state, listener notifications), plus path-safety tests for audio tokens.
- Review follow-ups that were already handled: snapshot refresh on manual
  config edits has been wired since 0.1.1 (extended to font/line-height/
  cursor in 0.3.0); ambient autoplay's first-click is a Chromium webview
  policy no setting can override — clicking a mood inside the panel counts
  as the gesture, after which retargeting is automatic.


## 0.3.1 — 2026-10-11

- **Save = see it:** creating a mood now applies it the moment you save, and
  editing the mood you're currently wearing re-applies live — no extra click
  to preview your own changes. Editing any other mood still just saves it.


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
