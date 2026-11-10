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

The entry point imports nothing yet. Once the host has imports, the build needs a bundler (esbuild is the candidate; it is approved for tooling only, so that is a plan section 7 request).
