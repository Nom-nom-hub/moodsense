# MoodSense — MVP Spec (v0.1)

Compressed from Andrew's full PRD (2026-10-11). The PRD is the vision; this is what ships first.

## The one-sentence product
Pick your mood in the status bar; your IDE reshapes itself around it — theme, font, ambient sound, focus level — and everything you were using before comes back when you switch MoodSense off.

## MVP scope (in)
- **Manual mood switcher** (PRD FR1): status-bar item + QuickPick + direct commands. Moods: Focused, Relaxed, Tired, Energetic. Custom moods via settings.
- **Mood profiles** (FR12): each mood maps to `{ theme, fontSize, zen, minimap, ambient, breakIntervalMultiplier }`. Editable in Settings JSON. Sensible defaults using **built-in VS Code themes only** — works with zero other extensions installed.
- **Environment adaptation** (FR4/FR5/FR6): theme + font size apply automatically. Layout changes (Zen mode, minimap) are **opt-in** (`moodsense.applyLayoutChanges`, default off) — the "suggest, don't impose" rule: the #1 churn risk is the IDE rearranging itself mid-flow uninvited.
- **Snapshot & restore** (FR18): before the first apply, MoodSense snapshots your current theme/font/minimap. "MoodSense: Off" restores them exactly. Your setup is never lost.
- **Ambient soundscapes** (FR8): webview player with three generated loops — Deep (low drone), Rain (brown noise), Wind (pink noise). Per-mood track + volume setting. No external audio assets, no streaming, no accounts.
- **Focus mode** (FR10): one command — Zen + minimap off + ambient on. Manual, always user-invoked.
- **Break reminders** (FR11): configurable interval (default 50 min), notification with Snooze / Dismiss / Turn off. Tired mood shortens the interval (multiplier 0.6). No biometrics — a timer, honestly labeled.
- **Privacy** (FR14–16): 100% local. No telemetry, no network calls, no accounts. Mood state lives in VS Code's own global state on your machine. Privacy dashboard = your settings file; there is nothing to delete from a server because there is no server.

## Explicitly out of MVP (from the PRD, deferred on purpose)
- **Biometric integration (FR2)** — deferred indefinitely. There is no reliable real-time path from Apple HealthKit / Google Fit into a desktop VS Code extension; Google Fit APIs are deprecated. If it ever lands, it's BLE heart-rate broadcast devices, labeled experimental.
- **ML preference learning (FR13)** — profiles + memory of your last choices cover this. No model in v1.
- **Behavioral mood inference** — already out of scope in the PRD; stays out.
- **JetBrains / other IDEs, cross-device sync** — future, per PRD.

## Success test for the MVP
Install it, use it for two weeks of real coding. If it's still enabled in week two, the idea has legs and the marketplace listing + metrics from the PRD (installs, rating) become the next decision. If it gets disabled, the adaptation defaults were too aggressive — fix the defaults, not the concept.

## Packaging notes
- Publisher in `package.json` is `nom-nom-hub` as a placeholder — a real VS Code Marketplace publisher ID must be created before `vsce publish`.
- Version 0.1.0. MIT license.
