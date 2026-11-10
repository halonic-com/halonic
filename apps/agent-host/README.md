# @halonicjs/app-agent-host

Halonic's agent host as one Node program. For now a placeholder: it prints its version and exits. The real host (E1) replaces `src/main.ts`.

- **Layer:** apps
- **Owner:** owen
- **Public API:** `@halonicjs/app-agent-host`

## Build one executable

```
pnpm --filter @halonicjs/app-agent-host build:sea
pnpm --filter @halonicjs/app-agent-host smoke:sea
```

`build:sea` turns `src/main.ts` into plain JavaScript and makes `dist/halonic-agent-host` (`.exe` on Windows) with Node's own single-executable support (`node --build-sea`), so no extra library is needed. The Node that runs the build is the base of the executable, so build with the Node the repo pins. `smoke:sea` runs the executable, checks what it prints and reports its size. CI does both on Linux, macOS and Windows.

## The payload

The host can't be one bundled file: sandbox-runtime finds its own programs (`apply-seccomp`, `srt-win.exe`) next to its code and runs as a separate Node program, so it needs real files on disk. So the entry point imports nothing, and the build embeds the files the host runs from as the executable's assets, one asset per file, keyed by its path in the payload:

- the host's own `src`, without tests and without `src/build`;
- every workspace package it depends on, at the same place as in the repo (`packages/core/ports/...`), with its `package.json` and its `src` without tests;
- every outside package those depend on, under `node_modules/`, without source maps and type declarations. Only `dependencies` and `optionalDependencies` count. Two copies of one outside package stop the build.

The build puts the payload's manifest (each file's SHA-256 and size, and one digest of them all) in front of the entry point, as it does the version. Unpacking the payload and loading the host from it come next (HAL-4476).
