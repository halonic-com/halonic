# Start Halonic when you log in

Halonic can start by itself when you log in to your computer, so your
routines run on time without you opening it first. It starts in the tray
(Windows) or the menu bar (macOS) without opening a window. This page says
what runs in the background, how to turn the setting on and off, and how to
stop everything.

## What runs in the background

For each workspace you open, Halonic starts one **engine**: a separate program
on your computer that starts routines on time, runs workflows and agents, and
records every run. The window only shows what the engine does. Closing the
window doesn't stop the engines; **Quit Halonic** does. See
[Keep routines running with the window closed](keep-routines-running-with-the-window-closed.md)
for the tray icon, its menu and what Quit does.

When Halonic starts at login:

- No window opens. The Halonic icon shows in the tray or the menu bar.
- It starts an engine for each workspace you had open when you last quit
  Halonic, and nothing else. A workspace that was deleted, moved or is no
  longer a workspace is skipped.
- Each engine checks that you trust the workspace, as it always does. A
  workspace that changed since you trusted it starts no routines until you
  review it in the window.
- If Halonic is running already, nothing happens.

In Task Manager (Windows) and Activity Monitor (macOS), Halonic shows as
**Halonic** and each engine as `halonic-agent-host`.

Halonic never runs in the background without an icon you can see. If your
desktop has no tray, a start at login exits at once and starts no engine.

## Turn it on or off

| System | Where |
| --- | --- |
| Windows | Settings › Startup › **Start Halonic when I log in** |
| macOS | Settings › Startup › **Start Halonic when I log in** |
| Linux | Not available. Halonic can't tell whether its tray icon shows, so it doesn't start in the background. |

1. Open Halonic and open Settings. You can also press Ctrl K (Cmd K on
   macOS) and type `Startup`.
2. Under **On this computer**, choose **Startup**.
3. Turn **Start Halonic when I log in** on or off.

The setting is for you only. Other people who log in to the same computer
aren't affected.

Off, Halonic starts only when you open it, and routines run only after you do.

If the switch says "Couldn't turn this on: only an installed Halonic can start
when you log in. Install Halonic, then try again.", you are running Halonic
from somewhere other than where it was installed, such as a downloads folder.
On Windows, that is the folder the installer put it in; on macOS, Halonic must
run from `/Applications` or `~/Applications`. Install Halonic, open the
installed copy, then turn the switch on. Turning it off works wherever Halonic
runs from.

### What the setting writes

Halonic adds one entry for your user, which starts Halonic with `--background`:

| System | Entry |
| --- | --- |
| Windows | The value `Halonic` under `HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run` |
| macOS | The LaunchAgent `~/Library/LaunchAgents/com.halonic.studio.plist` |

Turning the switch off removes the entry. On Windows, uninstalling Halonic
removes it too. Use Halonic's switch rather than your system's list of startup
apps: the switch reads the entry itself, so it may still show on after you
turn Halonic off in that list. If you did turn Halonic off there, turn it back
on in the same list: Halonic's switch can't undo it.

## Stop the engines

Turning **Start Halonic when I log in** off doesn't stop engines that are
running now. To stop them:

- **Quit Halonic** from the tray or menu bar icon (or Cmd+Q on macOS) stops
  every engine, then closes Halonic. Steps that are running get up to 10
  seconds to end. Routines don't start again until you open Halonic, or until
  your next login if the setting is on.
- **Pause routines** in the same menu keeps the engines running but stops
  routines from starting new runs, in every workspace, until you choose
  **Resume routines** or quit.

## See also

- [Keep routines running with the window closed](keep-routines-running-with-the-window-closed.md)
- [Start a routine with a signal](start-a-routine-with-a-signal.md)
