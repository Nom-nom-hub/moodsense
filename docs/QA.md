# MoodSense — Manual QA Checklist

Run in a real VS Code (Extension Development Host via F5, or the installed
VSIX) before any release. Automated tests cover profile/snapshot logic; this
list covers what only a live IDE can prove.

## Mood switching
- [ ] Each of the 4 moods applies its theme + font size within ~1s
- [ ] Status bar reads "MoodSense: <Mood>" after apply and after reload
- [ ] Setting a mood in one window does not corrupt another window's editor
      (settings are Global by design in v1 — confirm the behavior is sane)

## Snapshot & restore
- [ ] Start from a distinctive setup (e.g. Light theme, 18px, minimap on)
- [ ] Apply a mood → Off → theme, font, and minimap return exactly
- [ ] While a mood is active, hand-change the theme → Off → the HAND-PICKED
      theme is restored (the 0.1.1 guard), not the pre-mood one
- [ ] Off with no mood ever applied → friendly "off" message, no errors

## Layout (opt-in)
- [ ] With `moodsense.applyLayoutChanges` OFF: moods never toggle Zen/minimap
- [ ] With it ON: Focused enters Zen + hides minimap; Relaxed exits Zen
- [ ] Focus Mode command: Zen on, minimap off, ambient starts
- [ ] Manually toggling Zen, then Off: no double-toggle weirdness

## Ambient
- [ ] First mood with sound opens the player; pressing play starts the loop
- [ ] Switching moods retargets the track without reopening the panel
- [ ] Stop Ambient command pauses; closing the panel resets state cleanly
- [ ] Volume setting (`moodsense.ambient.volume`) is respected

## Break reminders
- [ ] Set interval to 1 minute → reminder fires with Snooze/Dismiss/Turn off
- [ ] Snooze re-fires ~10 minutes later (spot-check timer state, don't wait)
- [ ] Turn off persists `moodsense.breaks.enabled=false`
- [ ] Tired mood shortens the interval (multiplier 0.6)

## Cleanliness
- [ ] No network requests from the extension (DevTools / firewall spot-check)
- [ ] Extension Host log shows no errors across a full switch cycle

## Mood editor & ownership (0.3.0)
- [ ] "+ New mood" opens the editor; saving creates a row and writes moodsense.profiles
- [ ] Editor theme picker lists installed themes (incl. any marketplace themes)
- [ ] Accent swatch + custom color re-theme the panel when the mood is active
- [ ] A mood with fontFamily/lineHeight/cursorStyle applies them; switching to a
      mood without them returns the editor to your own defaults; Off restores all
- [ ] Edit a built-in → Reset restores its defaults; Delete is not offered
- [ ] Delete a custom mood (the active one) → mood clears cleanly
- [ ] Export copies JSON; Import of that JSON round-trips; Import of garbage
      shows the warning and changes nothing

## Review-release checks (0.4.0)
- [ ] Fresh profile / no mood ever picked: break countdown runs in the panel
      from startup (default interval), no mood selection needed
- [ ] Ctrl+Alt+M cycles moods in panel order and wraps; customs included
- [ ] Set moodsense.ambient.customDirectory to a folder with an .mp3: it shows
      under "Your audio", plays, and can be assigned to a mood in the editor
- [ ] A mood saved with a file: track whose file was later deleted fails
      silently (no crash, hint remains accurate)

## Alive-release checks (0.5.0)
- [ ] Schedule on with a window covering now + no mood worn: slot mood applies
      at startup; manual mid-window change stands; next boundary switches
- [ ] Quiet hours covering now: ambient silent, panel shows the quiet note,
      countdown targets the quiet end; reminders resume after
- [ ] Pomodoro on: countdown labeled Focus, phase flips at workMinutes,
      ambient pauses during Break phase, resumes after
- [ ] Layer: set rain under deep — both audible, layer quieter; mood switch
      crossfades (no hard cut) on both elements
- [ ] This week: rows appear after a mood session; Clear Mood History empties
- [ ] Routines from settings render as panel buttons and run
- [ ] Status bar text is tinted with the active mood's accent

## Review-fixes-II checks (0.5.1)
- [ ] Delete the custom mood you are wearing: theme restores, sound stops,
      status bar reads off — no half-state
- [ ] Focus Mode with no mood: status bar reads "MoodSense: Focus Mode"
- [ ] Import a pack containing "focused": modal prompt appears; Keep mine
      leaves the built-in untouched; Replace swaps it
- [ ] Editor theme list shows color dots matching each theme's real palette
- [ ] Panel Break section: Turn off silences reminders (countdown shows Off),
      Turn on resumes; Ctrl+Alt+P opens the panel

## Theme sync check (0.5.2)
- [ ] Panel closed → switch dark→light theme (or apply the Relaxed mood) →
      open the panel: its surfaces match the light theme immediately
- [ ] Panel open during a theme change: it repaints without reopening
