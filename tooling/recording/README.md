# @halonicjs/tooling-recording

Records a real terminal session and draws it as the animated SVG at the top of the README. The
output is never edited: only the typing speed and the pauses are set for reading.

- **Layer:** tooling
- **Owner:** noah
- **Public API:** `@halonicjs/tooling-recording`

## How a recording is made

Four steps, each in its own file, run by two commands (see "Making a new take" below).

1. **Capture** runs `halonic --version` once, off camera, then the commands for real. It writes
   `<name>.cast` (asciicast v2): what the terminal showed, with the real time of every write, and a
   marker where each command is typed. Next to it, `<name>.version` holds what `halonic --version`
   printed.
2. **Pace** sets the typing speed and the pauses from the recording file and writes
   `<name>.paced.cast`, still asciicast v2. Output text and the gaps inside a command's output stay
   as captured; only a long wait before a command's first output (a program starting up) is cut.
3. **Play** replays a paced cast through a small terminal and gives the screen after each write, as
   a `Tape` of styled text. It knows only what our CLI prints (text, CR/LF, tab, backspace, the 16
   colours, bold and dim, erase in line and cursor moves); any other escape code stops it with its
   name, so a new one in the CLI can't be drawn wrong without anyone noticing.
4. **Draw** turns the tape into `<name>.svg`, which plays once and rests on its last frame, and
   `<name>-still.svg`, only that last frame. Both use the website's dark code window and our status
   colours: green is drawn in the done teal, yellow in the waiting violet, and any other colour stops
   the drawing. A "✓" is drawn as a small check, because some monospace fonts have no ✓. The version
   in the window bar comes from `<name>.version`, never from the recording file.

The recording file (`recordings/first-run.json`) holds the commands, the terminal size, the step
labels in the window bar and the pacing of each command. A command can use a value from the session
so far, such as the id of the run that waits: write `{run}` in the command and give `set.run` a
shell command that prints it. It runs unseen.

## Making a new take

Build or install the `halonic` to record. `--bin` is the folder that holds it, or holds a small
`halonic` script that starts it; the take puts that folder first on its `PATH`. Then, from this
package's folder:

```sh
pnpm run capture --bin <folder with halonic> --dir <output folder>
pnpm run render --dir <output folder>
```

`render` prints each SVG's size and how long it plays. Copy the two SVGs to `docs/assets/readme/`
only after the board has seen the new render: the recording at the top of the README is a visual
decision. Keep the animated SVG under 100 KB and the still under 30 KB.

## What to know

- **Capture needs Linux.** It uses `script` from util-linux (2.35 or later) for a real terminal.
  macOS's `script` takes other options.
- **Format-neutral.** The cast is plain asciicast v2, so any player or GIF maker can use it.
- **A line wider than the window stops the take.** The terminal doesn't wrap, because a wrapped line
  in a recording looks broken. Shorten the CLI's line or widen the recording, with the board's yes.
- **Reduced motion works only in the SVG's own page.** Opened as a page, the animated SVG shows only
  its last frame when reduced motion is on. Inside an `<img>`, Chromium plays it anyway, because it
  doesn't pass the setting into images. That's why the README shows the still and plays the
  animation only after a click.
