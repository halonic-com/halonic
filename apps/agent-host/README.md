# @halonicjs/app-agent-host

Halonic's agent host as one Node program. It unpacks its files and serves on loopback, with a token made for each launch. It serves `GET /v1/health`, the `Sandbox` port, the Halonic bridge and the harnesses (Claude Code and Codex).

- **Layer:** apps
- **Owner:** owen
- **Public API:** `@halonicjs/app-agent-host`

## Build one executable

```
pnpm --filter @halonicjs/app-agent-host build:sea
pnpm --filter @halonicjs/app-agent-host smoke:sea
```

`build:sea` turns `src/main.ts` into plain JavaScript and makes `dist/halonic-agent-host` (`.exe` on Windows) with Node's own single-executable support (`node --build-sea`), so no extra library is needed. The Node that runs the build is the base of the executable, so build with the Node the repo pins. `smoke:sea` runs the executable in each of its uses below with a fresh profile folder, checks what it prints and reports its size. CI does both on Linux, macOS and Windows.

## The payload

The host can't be one bundled file: sandbox-runtime finds its own programs (`apply-seccomp`, `srt-win.exe`) next to its code and runs as a separate Node program, so it needs real files on disk. So the entry point imports nothing, and the build embeds the files the host runs from as the executable's assets, one asset per file, keyed by its path in the payload:

- the host's own `src`, without tests and without `src/build`. A test is a `.test` or `.spec` file, a test helper, a top-level `test/` folder, or anything under a `fixtures/`, `golden/` or `__snapshots__/` folder (`commands/test/` isn't one: it holds a command the host runs);
- every workspace package it depends on, at the same place as in the repo (`packages/core/ports/...`), with its `package.json` and its `src` without tests, by the same rule;
- every outside package those depend on, under `node_modules/`, without source maps and type declarations. Only `dependencies` and `optionalDependencies` count. Two copies of one outside package stop the build.

The build puts the payload's manifest (each file's SHA-256, size and executable mark, one digest of them all, the host's entry and the programs) in front of the entry point, as it does the version.

## Running it

```
halonic-agent-host --profile-folder <folder> [--version | --sandbox-check | --sandbox-setup | --sandbox-remove]
halonic-agent-host --profile-folder <folder> --stdio --relay-host 127.0.0.1:<port>
halonic-agent-host <unpacked program> [arguments]
```

With `--version` the host prints its version. Without any of these, it serves on loopback (below); with `--stdio`, over its standard input and output. The sandbox commands print one JSON line, and exit with 0 when it says `ok` and 1 when it doesn't, so an installer can go by the exit code alone:

| Command | Prints |
| --- | --- |
| `--sandbox-check` | whether the sandbox works on this machine: `{"ok":true,"reason":null,"missing":[]}`, or `ok` false with the reason and what is missing |
| `--sandbox-setup` | `{"ok":true}` once the one-time setup worked and the sandbox check passes, or `{"ok":false,"reason":"<one line>"}` |
| `--sandbox-remove` | `{"ok":true}` once what the setup left is removed (or nothing was set up), or `{"ok":false,"reason":"<one line>"}` |

`--sandbox-setup` is for the Windows installer, which runs it as an administrator: it runs srt's Windows install without srt's profile read grant, then the check (see sandbox-srt's README). The install is for the whole machine, so a check as the person's own account passes after an administrator answered the prompt. Running it again repairs the install or changes nothing. On other systems there is nothing to set up, and it exits with 1.

`--sandbox-remove` is for the Windows uninstaller, which runs it as an administrator, once (and for Settings › Remove the sandbox). It runs srt's Windows uninstall: the sandbox account and its profile, the `sandbox-runtime-users` group, the network filters, the `HKLM\SOFTWARE\sandbox-runtime` key, and the write grants kept on project folders by sessions of the user it runs as. It is `ok` when nothing was set up, and when run again. While a sandboxed program runs, srt removes nothing and says so. srt leaves `%ProgramData%\sandbox-runtime` (its CA key folder) in place. On other systems there is nothing to remove, and it exits with 0.

- **The host.** On launch the executable unpacks the payload into `<profile folder>/agent-host/<version>-<digest>` and checks every file against its SHA-256. A folder an earlier launch left is reused when every file still matches, and unpacked again otherwise. It unpacks into a temporary folder first and renames it, so a launch that stops halfway leaves nothing half-written. It then maps `@halonicjs/*` to the unpacked packages with a resolve hook and loads `src/host.ts`. The folder is inside Halonic's own data, so the profiles Studio builds must deny it to sandboxed programs, with the rest of that data (the `halonic-data` group). Studio's side isn't built yet; nothing on `main` builds that group so far.
- **Old folders.** More than one host can run on a profile folder (Studio launched twice, or the CLI next to it), so each host first claims its folder in `agent-host/running/<process id>` (written under a temporary `.writing` name and renamed, so a clean-up never reads a claim empty) and gives the claim up when it exits. Once its own folder is ready, the host removes the payload folders other versions and halfway launches left under `agent-host`, but never one a running host has claimed, nor that host's temporary folders. A claim whose host no longer runs is dropped, and anything that isn't a payload folder is left alone. This is best effort: a folder still in use (on Windows) stays until a later launch.
- **A payload program.** sandbox-srt starts srt's command line as `process.execPath <srt dist/cli.js>`, and here `process.execPath` is this executable. When the first argument is one of the manifest's programs inside a folder this version unpacked, and every file of the payload in that folder still has its digest (not only the program, which loads the files next to it), the executable runs it as Node would. The folder must also sit directly in an `agent-host` folder, so a folder that only has the right name isn't run. Any other argument isn't run.
  The whole payload is checked before the program runs, because it loads the rest of srt from the folder. That is as far as the check goes: the folder is in Halonic's own data, writable by your account, and a program that can write there can change the host's own files too, which no check here would stop. Keeping sandboxed agents out of it is the profile's job (above).
- **Workspace packages' `exports`.** The resolve hook reads a path, or conditions `node`, `import` or `default` that each name a path. Any other form (a list, `null`, nested conditions) stops the host with an error that names the package and the subpath.

## Serving on loopback

The program that starts the host (Studio) reads one line from its standard output:

```
{"url":"http://127.0.0.1:49152","token":"<43 characters>"}
```

The host listens on a free port of `127.0.0.1` only. The token is 32 random bytes in base64url, new at each launch, and goes only to that program on standard output: never in arguments, the environment or a file, where other programs could read it. A request gets in only when:

1. its `Host` header is `127.0.0.1:<port>` or `localhost:<port>`, so a web page that points its own domain at 127.0.0.1 (DNS rebinding) gets `421`;
2. it has no `Origin` header, so a request from a web page gets `403`; there is no CORS, because Studio's Rust side makes the requests;
3. its `Authorization` header is `Bearer <token>`, compared in constant time; otherwise `401`.

Every refusal comes before the path is looked at, so a caller without the token can't learn which paths exist. Answers are JSON; an error is `{"error":{"kind","message"}}`. The host stops when its standard input closes, so it never outlives the program that started it.

A request body is JSON of at most 1 MiB. A `Content-Length` over that gets `413` before any of the body is read, so a caller can't hold a request open by promising a body it never sends; a body without a length is counted as it arrives. A stream (the blocked accesses, the bridge's calls) never fills the host's memory either: when a caller keeps it open but stops reading, and more than 4 MiB wait to be sent, the host drops the connection and the route cleans up as if the caller had gone.

| Request | Answer |
| --- | --- |
| `GET /v1/health` | `{"ok":true,"version":"<version>"}` |
| `GET /v1/sandbox/check` | the `SandboxCheck`, as the port answers it |
| `GET /v1/sandbox/capabilities` | the `SandboxCapabilities` |
| `POST /v1/sandbox/sessions/open` with `{"profile"}` | `{"session","fence"}`: the new session's id and its fence proof |
| `POST /v1/sandbox/sessions/blocked` with `{"session"}` | a stream, one `SandboxBlock` per line (NDJSON), until the session closes |
| `POST /v1/sandbox/sessions/close` with `{"session"}` | `{"closed":true}` |
| `POST /v1/bridge/open` | an NDJSON stream: the bridge, then its calls to Studio (below) |
| `POST /v1/bridge/answer` | `{"answered":true}`, or `404` for a call the bridge isn't waiting for |
| `POST /v1/bridge/close` | `{"closed":true}`, or `404` for an unknown bridge |
| `GET /v1/harnesses` | `[{"id","name"}]` |
| `POST /v1/harnesses/detect` with `{"harness"}`, and `"settingsFolder"` for one agent | the `HarnessDetection` |
| `POST /v1/harnesses/sign-in` with `{"harness","settingsFolder"}` | `{"opened":true}`, or `{"opened":false,"reason","command"}` (below) |
| `POST /v1/harnesses/runs/start` | an NDJSON stream: the run's id, then its events (below) |
| `POST /v1/harnesses/runs/send` with `{"run","input"}` | `{"sent":true}`, or `409 send_failed` when the run refuses the input |
| `POST /v1/harnesses/runs/cancel` with `{"run"}` | `{"cancelled":true}` |

## Serving over standard input and output

In Halonic's WSL distro the host must not listen on a port: every WSL 2 distro of a person shares one network, so a port in ours would be open to their own Ubuntu too (HAL-5396, condition W9 of HAL-5407). There Studio starts the host with `--stdio --relay-host 127.0.0.1:<port>`. Studio's relay listens on Windows' own loopback, as the host does elsewhere, and passes each connection it accepts to the host as frames over `wsl.exe`'s standard input and output. The host serves the same routes with the same checks and limits; it never calls `listen()`.

The host first prints one line, `{"token":"<43 characters>"}` (no `url`: the relay has the address). After it, standard output carries frames only, in both directions:

```
[connection id: u32 big-endian][kind: u8][length: u32 big-endian][bytes]
```

| Kind | Value | Bytes | Means |
| --- | --- | --- | --- |
| `open` | 1 | none | the relay accepted a connection; only the relay opens them |
| `data` | 2 | at most 64 KiB | the connection's bytes, in order |
| `end` | 3 | none | the sender sends no more on this connection (half-close) |
| `reset` | 4 | none | the sender dropped the connection; nothing more goes either way |

- **Ids.** The relay numbers its connections 1, 2, 3, …, and never reuses an id. A frame for an id that has closed (sent before the relay saw the host's `reset`) is dropped. An `open` for an id that isn't new, any other frame for an id never opened, an unknown kind or a length over 64 KiB breaks the stream.
- **`Host`.** A request must name the relay, `127.0.0.1:<port>` or `localhost:<port>` with the port of `--relay-host`, so DNS rebinding against the relay's port gets `421`. Without a `--relay-host` on `127.0.0.1` the host exits with 2.
- **Limits.** The time limits apply as on loopback. The host keeps at most 256 connections open and answers an `open` past that with `reset`. All connections share one input, so the host can't make the relay wait on one: a connection with more than 4 MiB the host hasn't read yet is reset. The relay must read the host's output all the time, and keep a slow reader's backlog per connection.
- **Standard output is frames only.** Once the host serves, anything else that would print there goes to standard error.
- **Stop.** The host stops when its standard input ends, as on loopback, with exit code 0. When the stream breaks, it says why on standard error and exits with 1.

## The sandbox over loopback

Studio gives the engine a stand-in `Sandbox` that calls these routes, and the host runs the real one (`SrtSandbox`). The profile arrives as data, so the host checks it before the sandbox sees it: every field present, nothing extra, every path absolute (`400 body_invalid` names each problem with its path). A session that can't open gets `422 sandbox_open_failed` with the sandbox's reason.

A session is named by an id the host makes; any other id gets `404 unknown_session`. When a session's time limit runs out, the host closes it: its id is forgotten and its blocked stream ends. The host keeps at most 64 sessions open, counting those still opening; past that, opening one answers `429 too_many_sessions`. A `timeLimitMs` above 2,147,483,647 (about 24.8 days, the longest a timer can hold) is refused. When the host stops, it closes every open session before it stops serving, so no sandboxed program outlives it.

## The bridge over loopback

`harness-bridge` runs here, next to the sandbox whose program calls it, but the engine's recorder, tools, approvals and provider keys stay in Studio. Studio opens a bridge for one run with `{ runId, agentId, providers, prices }`; `prices` is each provider's models with a price, because the bridge asks for a price without waiting. The answer stays open as a stream:

```
{"type":"opened","bridge":"<id>","url":"http://127.0.0.1:41817","token":"<run token>"}
{"type":"call","call":"1","method":"secrets.get","params":{"name":"anthropic-key"}}
{"type":"call","call":"2","method":"recorder.record","params":{"type":"llm.request",...}}
{"type":"cancel","call":"3"}
```

The first line is `opened`, or `{"type":"failed","message"}` when the bridge couldn't listen. Each `call` is one of `recorder.record`, `tools.list`, `tools.check`, `tools.call`, `approvals.request` and `secrets.get`, with the port's arguments; Studio answers it with `POST /v1/bridge/answer` and `{ bridge, call, result }` or `{ bridge, call, error }`. A `cancel` means the bridge stopped waiting (the program went away), so Studio can stop the tool call or withdraw the approval. The host checks each answer against the port's shape, and asks only for the secrets the run's `providers` name. A bridge is named by a random id the host makes, like a session, because call ids (`1`, `2`, …) repeat from bridge to bridge.

Studio must answer `recorder.record`, `tools.list`, `tools.check` and `secrets.get` within 30 seconds, or the host sends a `cancel` and the bridge's request fails, so a Studio that hangs can't hold it forever. `tools.call` and `approvals.request` have no limit, because a tool's run and a person's approval rightly take long. A call fails too when Studio answers it with an error, or when the stream ends (Studio crashed or reloaded) before it answers.

The bridge closes on `POST /v1/bridge/close`, which waits until its last events are recorded and then ends the stream; when Studio goes away, which ends the stream; and when the host stops.

Each bridge listens on a port of its own, so the host keeps at most 64 bridges open, counting those still opening and those still closing; past that, opening one answers `429 too_many_bridges` before any stream starts.

## The harnesses over loopback

Studio gives the engine a stand-in `Harness` for each one the host lists, and the host runs the real one inside a sandbox session and with a bridge Studio opened here first. Studio starts a run with `{ harness, task, session, bridge }`, naming the session and the bridge by their ids, so the bridge's token never travels again. The answer stays open as a stream:

```
{"type":"started","run":"<id>"}
{"type":"event","event":{"type":"tool.called",...}}
{"type":"event","event":{"type":"agent.finished",...}}
{"type":"finished"}
```

A run that fails or is cancelled ends with `{"type":"failed","message"}` instead of `finished`. A harness, session or bridge the host doesn't have gets `404 unknown_harness`, `unknown_session` or `unknown_bridge`. When Studio goes away the run is cancelled, and when the host stops it cancels every run before it closes the sessions.

The port's `environment` has no route: the engine asks for it without waiting, and it only reads its arguments, so Studio calls the adapter's own function with the bridge's address and token from `/v1/bridge/open`.

## Signing an agent in

An agent that uses a Claude Code or Codex subscription signs in once, in its own settings folder (HAL-5395). `POST /v1/harnesses/sign-in` with `{ harness, settingsFolder }` opens a terminal the person can see (below), running the harness's own `signIn`: `claude auth login` with `CLAUDE_CONFIG_DIR`, or `codex login` with `CODEX_HOME`, set to that folder. The person signs in there as usual. The host only opens the window: it never reads, copies or waits for the sign-in, so Studio runs `detect` again when the person chooses Check again.

- `settingsFolder` must be an absolute path (`400 body_invalid` otherwise).
- The program is found on the host's `PATH`, as `detect` finds it. When it isn't there, or no window could open, the answer is `{ opened: false, reason, command }`: `command` is the sign-in to type by hand, in PowerShell on Windows (`$env:CLAUDE_CONFIG_DIR = '<folder>'; claude auth login`) and in `sh` elsewhere (`CLAUDE_CONFIG_DIR='<folder>' claude auth login`).
- A harness without a sign-in of its own gets `422 no_sign_in`, and a command the terminal refuses (a folder under a skill's `scripts/`) `422 sign_in_refused`.

## Opening a terminal the person can see

`openTerminal` (`src/terminal/open-terminal.ts`) opens a new terminal window that runs one program, so the person answers it themselves. It is for a harness program's own sign-in for one agent, such as `claude auth login` with `CLAUDE_CONFIG_DIR` set to that agent's settings folder. It takes the program's absolute path, plain-word arguments and the variables to add to the person's environment:

- **Windows:** `cmd.exe` from the Windows folder runs `start`, which opens a new console window. The variables travel in the environment, never on the command line, and a program path with a `%` in it isn't run, because `cmd.exe` would expand it.
- **macOS:** it writes a `.command` file to a new private temp folder and opens it with `open`, so the person's chosen terminal runs it. The variables are quoted for `sh` there.
- **Linux:** it uses the first of `x-terminal-emulator`, `gnome-terminal`, `konsole`, `xfce4-terminal` and `xterm` it finds on the `PATH`, with the variables in its environment.

It answers `{ opened: false, reason }` when no window could open: no terminal or desktop session, or a start that failed. The caller then shows the command to run by hand. It throws, as a mistake in the caller, for a program that isn't an absolute path, an argument that isn't a plain word, a variable name that isn't one, and a program or variable under a skill's `scripts/` folder.
