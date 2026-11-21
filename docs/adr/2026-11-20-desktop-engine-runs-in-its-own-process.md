# The desktop engine runs in its own process, which the shell owns and the page reaches only through the shell

- **Status:** Accepted; extended by [desktop engines are keyed by workspace path](2026-11-21-desktop-engines-are-keyed-by-workspace-path.md)
- **Date:** 2026-11-20

## Context

On desktop, the Studio page builds its own engine (`studio.engine-reload`), so
routines and timers stop when the window closes. For 0.1 the board decided that
closing the window keeps Halonic running in the tray or menu bar, that several
workspaces can run in the background at once, and that "Start Halonic when I log
in" exists and is off by default (HAL-14206).

What we start from:

- The agent host (`halonic-agent-host`) is a Node single executable. It serves on
  loopback with a per-launch token, refuses an `Origin` header and a wrong
  `Host`, and exits when its stdin closes. The Rust shell starts it and keeps the
  token.
- On Windows the sandbox host usually runs inside WSL (`srt-wsl`), so the engine
  can't live in that process: it has to run natively, next to the workspace.
- The desktop keeps secrets in the OS keychain, which only the shell reads. A
  Node process can't.
- Workspace and instruction trust are plain files in the profile, written by the
  shell after a native dialog and read by `fs-node` in the same format.
- `adapters/executor-remote` already implements the whole `RunExecutor` over
  HTTP.

We looked at running the engine inside the sandbox host (it's in WSL on most
Windows machines), a second executable (doubles the download and the signing
work), a Node keychain addon in the engine (a new native dependency and a second
keychain caller, rejected for the same reason in
[Studio hands a plugin its secrets](2026-11-19-studio-hands-a-plugin-its-secrets.md)),
a sealed secret file (also rejected there) and passing secrets at launch (never
in arguments or the environment, and they would go stale).

## Decision

**One process per workspace.** The agent host executable gets an engine role:
`halonic-agent-host --engine --profile-folder <folder> --workspace <folder>`. It
runs the CLI's engine host code (moved to a shared package so `apps/cli` and
`apps/agent-host` both use it), the engine's routes and the routine scheduler for
that workspace. It holds the workspace's `engine.lock` with `holdLock`, the file
and format the CLI uses, so the CLI and the desktop still exclude each other.
Several workspaces run at once, one engine process each, under one supervisor in
the shell that starts, tracks and stops them. An engine started from the terminal
is found read-only through the lock's `holder.pid`; the shell never stops it.
The sandbox host stays a separate process, as today.

**The control pipe.** The shell keeps the engine's stdin and stdout as a private
control channel. The engine prints one handshake frame, then both sides send
frames with a 4-byte length prefix and a hard cap (64 KiB for control frames; the
largest secret value plus overhead for a secret answer). The shell parses frames
into a closed set of kinds from the engine: `handshake`, `secret_get`,
`token_get`, `origins_get`, `health` and `stopped`. Anything else is a fault: a
length over the cap or zero, bad UTF-8 or JSON, an unknown kind, an unknown or
repeated request id, or a frame before the handshake. On a fault the shell closes
stdin, kills the engine and counts a crash. It never logs a frame's content.
Nothing but the frame writer writes to the engine's stdout. The engine exits when
stdin closes, so it never outlives the shell.

**The HTTP API.** The engine listens on `127.0.0.1` on a port the system picks.
Every route needs the launch token, which never leaves the shell; any `Origin`
gets 403 and a wrong `Host` 421, before the path is looked at. The engine builds
an explicit route list from the route factories: the run routes (start, agent
start, waiting runs, events, send, cancel) and two routine routes,
`GET /api/routines` and `POST /api/routines/<id>/run`. It never calls
`createServer`, so it serves no trust, provider-key, webhook, connector-call,
chat-turn, Google, workspace or page route, and it refuses to start if a route is
token-free. The page reaches it only through two shell commands,
`engine_request` and `engine_stream`, which take a route name, never a URL, in a
`desktop-engine` capability that is local and for the main window only. `serve`
is unchanged.

**Secrets.** The engine asks the shell over the control pipe, and the shell reads
the keychain. There are three read-only requests:

- `secret_get`: a workspace secret. The shell refuses by rule, in Rust:
  `token_key`, `serve_password`, every name `SecretName::is_halonic` covers
  (including `halonic_token_*`) and `plugin__*`.
- `token_get`: an OAuth token, through the shell's existing `get_token`.
- `origins_get`: a key's allowed origins. The engine can't set, delete or add
  one.

The shell answers only while the engine's workspace is trusted on this computer.
A keychain call answers `unavailable` after about 30 seconds, and the run step
fails with "secrets unavailable" rather than hanging. The engine may keep a value
for one step, on the step's own object, and adds every value to its redaction
set. No value is written to disk, logged, or put in arguments or the
environment. Plugin secrets don't go to the engine; they follow
[Studio hands a plugin its secrets](2026-11-19-studio-hands-a-plugin-its-secrets.md).

**Trust.** The engine reads the same trust files with the `fs-node` stores and
checks again when a routine fires and right before each harness step. Only the
window grants trust, through the native dialog. A background run that needs a
grant starts nothing and leaves one "needs your trust" Inbox item per workspace.
The item holds the workspace and a fixed kind, and only opens the window.

**The page is a client.** On desktop the page no longer builds an engine or holds
`engine.lock`. A `RemoteEngine` implements the service interfaces features use
today on top of `executor-remote`, with a fetch that goes through
`engine_request` and `engine_stream`. Run updates are pushed instead of re-read.
The Studio served to a browser keeps its own engine.

**Lifetime.**

- Closing the window hides it; the engines keep running.
- Quit stops the schedulers, lets running steps end for up to 10 seconds,
  records the rest as interrupted and releases the locks. After 15 seconds the
  shell kills what is left.
- A crashed engine restarts at most 3 times in 5 minutes, then shows a problem
  state. Runs resume from their logs as `studio.engine-reload` says, and nothing
  runs twice. An app update counts as a Quit.
- An engine runs only while the tray or menu-bar icon is shown. If the shell
  can't create the icon, it doesn't run in the background: it opens the window,
  or exits if it started at login.

**Login item.** `tauri-plugin-autostart`, off by default. Only one shell command,
`login_item_set`, turns it on, from the Settings toggle; no window gets the
plugin's own JavaScript permissions. The shell fixes the only argument,
`--background`, which starts no window and runs engines for the workspaces open
at the last Quit, as listed in the profile, never in arguments.

## Consequences

- Routines and timers fire with the window closed, and several workspaces can run
  side by side.
- The desktop page becomes a client of the engine, and both engines pass one
  contract suite of feature tests.
- The shell gains a supervisor, a control-pipe reader, a secret broker and a tray.
  Each is security code: the pull requests for the broker, the engine role, the
  tray and the login item each get a separate security review.
- Tests keep this true: one that lists the engine's routes and fails on any extra
  route, one that sends every route without the token and expects 401, one shared
  refusal test for the agent host server and the engine server, table tests for
  every control-pipe fault, a canary value that must not reach the engine's log,
  and a Linux CI run without the tray library.
- `tauri-plugin-autostart` needs an entry in `tooling/check/dependencies.json`.
  Linux builds need `libayatana-appindicator3`.
- The shell's Rust `run-lock` commands stay for one release as a fallback, then
  go.
- Only Windows has an installer today, so the background engine ships on Windows
  first. Building macOS and Linux installers is its own release question.
- The threat model gets rows for the engine on loopback, the secret broker, the
  control pipe, background runs and trust, and the login item.
