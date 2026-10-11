# MoodSense — Mood-Adaptive IDE

**Pick your mood. Your IDE reshapes itself around it.**

MoodSense is a VS Code extension that adapts your coding environment to how
you're working: set a mood in the status bar and your theme, font size,
ambient soundscape, and break rhythm follow. Switch it off and your original
setup comes back, exactly as it was.

100% local. No telemetry, no accounts, no network calls. Your mood never
leaves your machine.

## Moods

| Mood | Theme | Font | Ambient | Breaks |
| --- | --- | --- | --- | --- |
| Focused | Default Dark Modern | 14px | Deep drone | Standard |
| Relaxed | Quiet Light | 14px | Rain | Standard |
| Tired | Default Dark Modern | 16px | Rain | More frequent |
| Energetic | Monokai | 13px | Wind | Less frequent |

Every mapping is a setting (`moodsense.profiles`) — change the theme, font,
sound, or rhythm for any mood, or invent your own moods entirely. Default
profiles use only built-in VS Code themes, so MoodSense works with zero
other extensions installed.

## How it works

- **Status bar switcher** — click the MoodSense item, pick how you're working.
- **Snapshot & restore** — before the first mood applies, MoodSense saves your
  current theme/font/minimap. `MoodSense: Off` restores them byte-for-byte.
- **Gentle by default** — theme, font, and sound adapt automatically. Layout
  changes (Zen mode, minimap) only happen if you opt in
  (`moodsense.applyLayoutChanges`) or invoke **Focus Mode** yourself. Your IDE
  never rearranges itself uninvited.
- **Ambient player** — three generated soundscapes (deep drone, rain, wind)
  in a small webview player. Generated locally; nothing streams.
- **Break reminders** — a plain, honest timer (default 50 min) with Snooze /
  Dismiss / Turn off. The Tired mood shortens the interval automatically.

## Commands

- `MoodSense: Set Mood…` — the picker
- `MoodSense: Focused / Relaxed / Tired / Energetic` — direct set
- `MoodSense: Off (Restore My Setup)`
- `MoodSense: Focus Mode`
- `MoodSense: Open Ambient Player` / `Stop Ambient Sound`
- `MoodSense: Reset Break Timer`

## Privacy

MoodSense stores exactly two things, both in VS Code's own local global
state: your current mood and the settings snapshot used for restore. There is
no server, no analytics, and no third-party anything. Delete the extension
and every trace goes with it.

## Development

```bash
npm install
npm run compile
npm run package   # produces moodsense-0.1.0.vsix
```

Press `F5` in VS Code to run the extension in a development host.

## Roadmap (from the PRD)

- More soundscapes + user-supplied audio
- Per-workspace moods
- JetBrains support
- Biometrics: **not promised.** There is no reliable real-time path from
  consumer health platforms into a desktop IDE extension today; if that
  changes, it lands as an explicitly experimental opt-in.

## License

MIT
