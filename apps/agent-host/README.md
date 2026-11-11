# @halonicjs/app-agent-host

Halonic's agent host as one Node program. It unpacks its files and serves on loopback, with a token made for each launch. It serves the `Sandbox` port; the bridge and the harnesses come next (HAL-4476).

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

- the host's own `src`, without tests and without `src/build`;
- every workspace package it depends on, at the same place as in the repo (`packages/core/ports/...`), with its `package.json` and its `src` without tests;
- every outside package those depend on, under `node_modules/`, without source maps and type declarations. Only `dependencies` and `optionalDependencies` count. Two copies of one outside package stop the build.

The build puts the payload's manifest (each file's SHA-256, size and executable mark, one digest of them all, the host's entry and the programs) in front of the entry point, as it does the version.

## Running it

```
halonic-agent-host --profile-folder <folder> [--version | --sandbox-check]
halonic-agent-host <unpacked program> [arguments]
```

With `--version` the host prints its version, and with `--sandbox-check` whether the sandbox works on this machine, as JSON. Without either, it serves (below).

- **The host.** On launch the executable unpacks the payload into `<profile folder>/agent-host/<version>-<digest>` and checks every file against its SHA-256. A folder an earlier launch left is reused when every file still matches, and unpacked again otherwise. It unpacks into a temporary folder first and renames it, so a launch that stops halfway leaves nothing half-written. It then maps `@halonicjs/*` to the unpacked packages with a resolve hook and loads `src/host.ts`. The folder is inside Halonic's own data, which the sandbox profile denies to the programs it runs.
- **A payload program.** sandbox-srt starts srt's command line as `process.execPath <srt dist/cli.js>`, and here `process.execPath` is this executable. When the first argument is one of the manifest's programs inside a folder this version unpacked, and the file still has its digest, the executable runs it as Node would. Any other argument isn't run.

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

| Request                                                | Answer                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| `GET /v1/health`                                       | `{"ok":true,"version":"<version>"}`                                      |
| `GET /v1/sandbox/check`                                | the `SandboxCheck`, as the port answers it                               |
| `GET /v1/sandbox/capabilities`                         | the `SandboxCapabilities`                                                |
| `POST /v1/sandbox/sessions/open` with `{"profile"}`    | `{"session","fence"}`: the new session's id and its fence proof          |
| `POST /v1/sandbox/sessions/blocked` with `{"session"}` | a stream, one `SandboxBlock` per line (NDJSON), until the session closes |
| `POST /v1/sandbox/sessions/close` with `{"session"}`   | `{"closed":true}`                                                        |

## The sandbox over loopback

Studio gives the engine a stand-in `Sandbox` that calls these routes, and the host runs the real one (`SrtSandbox`). The profile arrives as data, so the host checks it before the sandbox sees it: every field present, nothing extra, every path absolute (`400 body_invalid` names each problem with its path). A body larger than 1 MiB gets `413`. A session that can't open gets `422 sandbox_open_failed` with the sandbox's reason.

A session is named by an id the host makes; any other id gets `404 unknown_session`. When a session's time limit runs out, the host closes it: its id is forgotten and its blocked stream ends. The host keeps at most 64 sessions open, counting those still opening; past that, opening one answers `429 too_many_sessions`. A `timeLimitMs` above 2,147,483,647 (about 24.8 days, the longest a timer can hold) is refused. When the host stops, it closes every open session before it stops serving, so no sandboxed program outlives it.
