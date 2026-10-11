# MoodSense — Manual QA Checklist

Run in a real VS Code (Extension Development Host via F5, or the installed
VSIX) before any release. Automated tests cover profile/snapshot logic; this
list covers what only a live IDE can prove.

## Mood switching
- [ ] Each of the 4 moods applies its theme + font size within ~1s
- [ ] Status bar shows the active mood with emoji after apply and after reload
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
