# @halonicjs/app-agent-host

Halonic's agent host as one Node program. For now it unpacks its files, prints its version and, with `--sandbox-check`, says whether the sandbox works on this machine. The loopback server comes next (HAL-4476).

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
halonic-agent-host --profile-folder <folder> [--sandbox-check]
halonic-agent-host <unpacked program> [arguments]
```

- **The host.** On launch the executable unpacks the payload into `<profile folder>/agent-host/<version>-<digest>` and checks every file against its SHA-256. A folder an earlier launch left is reused when every file still matches, and unpacked again otherwise. It unpacks into a temporary folder first and renames it, so a launch that stops halfway leaves nothing half-written. It then maps `@halonicjs/*` to the unpacked packages with a resolve hook and loads `src/host.ts`. The folder is inside Halonic's own data, which the sandbox profile denies to the programs it runs.
- **A payload program.** sandbox-srt starts srt's command line as `process.execPath <srt dist/cli.js>`, and here `process.execPath` is this executable. When the first argument is one of the manifest's programs inside a folder this version unpacked, and the file still has its digest, the executable runs it as Node would. Any other argument isn't run.
