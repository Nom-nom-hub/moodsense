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

## Make it yours

MoodSense is built to be owned, not just used:

- **Visual mood editor** — open the MoodSense panel, hover any mood, hit the
  pencil (or "+ New mood"). Name it, pick an icon and an accent color, choose
  any theme you have installed (Dracula, One Dark Pro, your own finds —
  if it's in your VS Code, it's in the picker), set the font size, soundscape,
  and break rhythm. Under *Typography & cursor*, a mood can also carry its
  own font family, line height, and cursor style. No JSON required — saving
  writes to your settings for you.
- **Your colors** — every mood has its own accent hue; the whole panel
  re-themes around the mood you're in.
- **Export / Import** — your mood set copies out as JSON from the panel
  footer. Share a mood pack with a friend; import theirs (packs are
  validated and sanitized before they can touch your settings).
- **Protected defaults** — built-in moods can be edited and reset to their
  defaults in one click, never accidentally deleted.

## How it works

- **Status bar switcher** — click the MoodSense item, pick how you're working.
- **Control panel** — a sidebar home for your moods, ambient sound, and break
  countdown, with the mood editor built in.
- **Snapshot & restore** — before the first mood applies, MoodSense saves
  your current theme, font, line height, cursor, and minimap.
  `MoodSense: Off` restores them byte-for-byte — and if you change any of
  them by hand mid-mood, the restore point follows your latest setup.
- **Gentle by default** — theme, font, and sound adapt automatically. Layout
  changes (Zen mode, minimap) only happen if you opt in
  (`moodsense.applyLayoutChanges`) or invoke **Focus Mode** yourself. Your IDE
  never rearranges itself uninvited.
- **Ambient sound** — three generated soundscapes (deep drone, rain, wind)
  played from the control panel — or **your own audio**: set
  `moodsense.ambient.customDirectory` to a folder of audio files and they
  appear in the panel under "Your audio," ready to play or assign to a mood.
- **Break reminders** — a plain, honest timer (default 50 min) with Snooze /
  Dismiss / Turn off. The Tired mood shortens the interval automatically.

## Commands

- `MoodSense: Set Mood…` — the picker
- `MoodSense: Focused / Relaxed / Tired / Energetic` — direct set
- `MoodSense: Off (Restore My Setup)`
- `MoodSense: Focus Mode`
- `MoodSense: Open Control Panel` / `Stop Ambient Sound`
- `MoodSense: Reset Break Timer`
- `MoodSense: Export Moods (JSON to Clipboard)` / `Import Moods (Paste JSON)` / `Reset Moods to Defaults`
- `MoodSense: Cycle Mood` — step through your moods (Ctrl+Alt+M / Cmd+Alt+M)

## It runs itself, politely

- **Schedule** — `moodsense.schedule` + `schedule.enabled`: moods switch at
  time boundaries (Energetic at 09:00, Tired at 18:00). Only at boundaries —
  pick a mood by hand mid-window and it stands until the next one.
- **Quiet hours** — `moodsense.quietHours`: sound mutes and reminders wait
  until the window ends.
- **Pomodoro** — `moodsense.pomodoro.enabled`: 25/5 focus cycles on the
  timer; the soundscape pauses during breaks.
- **Layered sound** — every mood can carry a second track underneath
  (rain + deep drone), and all changes crossfade.
- **This week** — the panel charts your last 7 days of mood time from a
  local session log. Yours alone; clear it any time.
- **Routines** — `moodsense.routines`: named one-click composites in the
  panel ("Good morning", "Deep work" + Focus Mode).

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

- Per-workspace moods
- Not planned, because the platform can't: call detection, OS
  Do-Not-Disturb sync, and battery state have no VS Code extension APIs
- JetBrains support
- Biometrics: **not promised.** There is no reliable real-time path from
  consumer health platforms into a desktop IDE extension today; if that
  changes, it lands as an explicitly experimental opt-in.

## License

MIT
