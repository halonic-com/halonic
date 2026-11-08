# @halonicjs/tooling-config

Shared settings every package extends.

- **Layer:** tooling
- **Owner:** mateo
- **TypeScript presets** (`tsconfig/`): `base.json` (strict settings, Node's
  type stripping rules: `.ts` import extensions, erasable syntax only),
  `core.json` (Web-standard types only, below), `host.json` (those types
  and their values), `node.json`, `web.json` and `studio.json`.
  A package uses `"extends": "@halonicjs/tooling-config/tsconfig/<preset>.json"`.
- **Web types** (`types/`): `web-types.d.ts` holds only the interfaces
  (`Request`, `Response`, `Headers`, `URL`, streams, `AbortSignal`,
  `TextEncoder`/`TextDecoder`, `crypto.subtle`) and goes to the core;
  `web-globals.d.ts` holds the values (`fetch`, `new Request()`, timers)
  and goes to the host only. `test/fixtures/web-types/` proves what each
  preset allows and forbids; `pnpm typecheck` here runs it.
- **Biome** (`biome.jsonc`): formatting and lint rules, extended by the
  root `biome.json`.
- **Vitest preset** (`@halonicjs/tooling-config/vitest`):

  ```ts
  import { definePackageTestConfig } from "@halonicjs/tooling-config/vitest";

  export default definePackageTestConfig();
  ```

  The preset measures coverage of `src` on every run and fails when it is
  below the package's floor, `"halonic": { "coverage": { "lines", "branches" } }`
  in its `package.json`. See [checks.md](../../docs/guides/checks.md#coverage-floors).
