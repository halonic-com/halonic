# mcp.runner-lookup

- Status: active
- Since: 0.1.0
- Source: HAL-230 and HAL-2544 (the pinned launcher finds its runner itself, from the HAL-2559 decision: a pinned connector may no longer set `PATH`, `HOME`, `PATHEXT` or `COMSPEC`)

The pinned launcher shall find a pinned connector's runner, and for an npm runner the `node` it needs, only in the app's own environment, never in the connector's `env`: in the absolute folders of the app's `PATH`, then on macOS in the `PATH` the person's login shell sets, then in the usual install folders (Homebrew, `/usr/local/bin`, `~/.local/bin`, `~/.cargo/bin`, `~/.volta/bin` and `~/.bun/bin`; on Windows Node's folder under `%ProgramFiles%`, npm's under `%APPDATA%`, and `.local\bin` and `.cargo\bin` under `%USERPROFILE%`). It shall refuse a command with a folder that isn't a full path, because it would depend on the folder the app runs in, and take a full path as written. On Windows it shall try a bare name or a full path without an ending with each `.com`, `.exe`, `.bat` and `.cmd` ending in `%PATHEXT%`'s order, read `PATH` and `PATHEXT` in any letter case, take a `PATH` folder written in quotes, and start a `.com` or `.exe` runner directly. It shall start npm's `npx.cmd` or `npm.cmd` as the `node.exe` next to it, or else the first `node.exe` in those folders, with npm's own `npx-cli.js` or `npm-cli.js`, and refuse any other `.cmd` or `.bat` runner, because only a shell can start it. It shall give the runner's folder and `node`'s folder to put first on the program's `PATH`. When it finds no runner, or no `node` for an npm runner, it shall refuse the launch, naming the program it couldn't find and asking for the runner's full path.

## Examples

- Given a macOS desktop app whose `PATH` is `/usr/bin:/bin`, and a login shell whose `PATH` holds `/acme/.volta/bin` with `npx` and `node`,
  when the runner `npx` is looked for,
  then it is `/acme/.volta/bin/npx`, with `/acme/.volta/bin` first on the program's `PATH`.
- Given Windows with `npx.cmd`, `node.exe` and `node_modules\npm\bin\npx-cli.js` in Node's folder,
  when the runner `npx` is looked for,
  then it starts as that `node.exe` with `npx-cli.js` before the runner's own arguments, and no shell.
