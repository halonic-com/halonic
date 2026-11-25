# Keep routines running with the window closed

On Windows and macOS, Halonic keeps running in the tray (Windows) or the menu
bar (macOS) when you close its window. Your routines and timers keep going,
and runs you started keep going. This page says where runs happen, what
closing and **Quit Halonic** do, and what to do when something doesn't start.

## Where runs happen

A run doesn't happen in the window. For each workspace you open, Halonic starts
one **engine**: a separate program on your computer that starts routines on
time, runs workflows and agents, and records every run. The window only shows
what the engine does and sends it your answers.

Because the engine is separate:

- Closing the window doesn't stop it.
- Two windows on the same workspace share one engine.
- It can't be reached from a web page or from another computer. Only Halonic
  talks to it.

In Task Manager (Windows) and Activity Monitor (macOS), the window shows as
**Halonic** and each engine as `halonic-agent-host`.

## What closing the window does

| Where | Closing the window | The engines |
| --- | --- | --- |
| Windows, macOS | Hides the window. The tray icon stays. | Keep running. |
| Linux | Quits Halonic. | Stop, as with **Quit Halonic** below. |

To bring the window back, choose **Open Halonic** in the tray menu. On macOS you
can also click the Halonic icon in the Dock.

If the desktop has no tray, closing the window quits Halonic on every system.
Halonic never runs in the background without a tray icon, so you can always
see that it runs.

## The tray icon

The Halonic ring shows the state in its centre:

| Centre | Meaning |
| --- | --- |
| Nothing | Engines are running and no run is in progress. |
| A dot | At least one run is in progress. |
| Pause bars | You paused routines. |
| `!` | An engine stopped after 3 restarts in 5 minutes. The menu's first line says "The background engine stopped 3 times". See [the engine won't start](#the-engine-wont-start). |

The first line of the tray menu says what is going on, for example
`2 runs in progress`, `Routines paused` or `Nothing running`. Choosing it
opens Halonic. The menu also has:

- **Open Halonic**.
- **Pause routines**, which stops routines from starting a run in every
  workspace until you choose **Resume routines** or quit. In the `!` state the
  menu has no **Pause routines**.
- **Try again**, only in the `!` state, where the menu has just **Try again**
  and **Open Halonic**.
- **Quit Halonic**.

## What Quit does

**Quit Halonic** (tray menu, or Cmd+Q on macOS) stops every engine and then
closes Halonic. The menu shows `Quitting…` with nothing to click while it
works:

1. Each engine stops its routines from starting new runs.
2. Steps that are running get up to 10 seconds to end.
3. A run whose step is still going after that is recorded as interrupted.
4. If an engine hasn't stopped after 15 seconds, Halonic ends it.

Routines don't start while Halonic is quit. A run that was waiting for you or
for a timer keeps waiting, and goes on when Halonic runs again. A run that was
in the middle of a step when the engine ended is not started a second time.

An update that restarts Halonic counts as a Quit.

## When something doesn't work

### The engine won't start

If an engine stops by itself, Halonic starts it again. After 3 restarts in 5
minutes it gives up, the tray icon shows `!`, and the workspace's routines
don't run.

1. Open the tray menu and choose **Try again**.
2. If it stops again, quit and start Halonic.
3. If that doesn't help, open `studio/shell.log` in Halonic's profile folder.
   It says why the engine didn't start. It never holds a secret.

### Another engine holds the workspace

Only one engine can run a workspace at a time. If another one does, such as
`halonic routines watch` in a terminal, Studio says the workspace "is already
running in another Halonic on this computer", and **Copy details** shows the
process number.

Stop that one, then try again. The terminal's engine and Halonic's don't share
runs: the first one that holds the workspace runs its routines.

### A step says "Secrets unavailable"

A run step that needs a key asks Halonic for it, and Halonic reads it from your
computer's keychain. If the keychain is locked and waits for a password,
Halonic waits about 30 seconds and then fails the step with
`Secrets unavailable: the keychain is …`. The run doesn't hang.

Unlock the keychain (on macOS, sign in to it in Keychain Access; on Linux,
unlock the Secret Service in your desktop's password manager), then start the
run again. A routine tries again at its next time.

### A routine starts nothing because the workspace isn't trusted

Halonic runs a workspace's programs only after you trust it on this computer.
It checks again every time a routine fires and before every step. If you
changed the workspace outside Halonic, for example with `git pull`, it no
longer matches what you trusted, and the engine starts nothing from it.

Open Halonic, open the workspace and press **Review** in the header. Trusting
a workspace is only possible there, in the window. The engine never asks you
and never grants it.

## See also

- [Start a routine with a signal](start-a-routine-with-a-signal.md)
- [Threat model: the agent host](../security/threat-model.md#the-agent-host)
