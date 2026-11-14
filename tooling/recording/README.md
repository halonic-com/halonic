# @halonicjs/tooling-recording

Records a real terminal session and draws it as the animated SVG at the top of the README. The
output is never edited: only the typing speed and the pauses are set for reading.

- **Layer:** tooling
- **Owner:** noah
- **Public API:** `@halonicjs/tooling-recording`

## How a recording is made

This first part is the capture. The pacing, the drawing and the command line follow in later pull
requests, and this README grows with them.

1. **Capture** runs `halonic --version` once, off camera, then the commands for real. It writes
   `<name>.cast` (asciicast v2): what the terminal showed, with the real time of every write, and a
   marker where each command is typed. Next to it, `<name>.version` holds what `halonic --version`
   printed.

The recording file (`recordings/first-run.json`) holds the commands, the terminal size, the step
labels in the window bar and the pacing of each command. A command can use a value from the session
so far, such as the id of the run that waits: write `{run}` in the command and give `set.run` a
shell command that prints it. It runs unseen.

## What to know

- **Capture needs Linux.** It uses `script` from util-linux (2.35 or later) for a real terminal.
  macOS's `script` takes other options.
- **Format-neutral.** The cast is plain asciicast v2, so any player or GIF maker can use it.
