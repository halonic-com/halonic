# @halonicjs/tooling-config

Shared settings every package extends.

- **Layer:** tooling
- **Owner:** mateo
- **TypeScript presets** (`tsconfig/`): `base.json` (strict settings, Node's
  type stripping rules: `.ts` import extensions, erasable syntax only),
  `core.json` (no Node or browser types, so `fetch`, `document` or `fs`
  are compile errors), `web-standard.json` (`fetch`, `Request`, `URL`,
  `crypto.subtle` and streams, but no DOM and no Node: host packages,
  Workers code and adapters that run anywhere), `node.json`, `web.json`
  and `studio.json`.
  A package uses `"extends": "@halonicjs/tooling-config/tsconfig/<preset>.json"`.
- **Biome** (`biome.jsonc`): formatting and lint rules, extended by the
  root `biome.json`. A skipped test (`it.skip`, `describe.skip`, `xit`)
  is a lint error, so it can't land on `main`.
- **Vitest preset** (`@halonicjs/tooling-config/vitest`):

  ```ts
  import { definePackageTestConfig } from "@halonicjs/tooling-config/vitest";

  export default definePackageTestConfig();
  ```

  A package with no tests fails, tests run in random order, and a test
  that never calls `expect()` fails.
  `src/test-hygiene.test.ts` proves both test rules.
