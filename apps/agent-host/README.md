# @halonicjs/app-agent-host

Halonic's agent host as one Node program. It unpacks its files and serves on loopback, with a token made for each launch. For now it answers only `GET /v1/health`; the sandbox, the bridge and the harnesses come next (HAL-4476).

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

| Request          | Answer                              |
| ---------------- | ----------------------------------- |
| `GET /v1/health` | `{"ok":true,"version":"<version>"}` |
