# @halonicjs/tooling-config

Shared settings every package extends.

- **Layer:** tooling
- **Owner:** mateo
- **TypeScript presets** (`tsconfig/`): `base.json` (strict settings, Node's
  type stripping rules: `.ts` import extensions, erasable syntax only),
  `core.json` (no Node or browser types, so `fetch`, `document` or `fs`
  are compile errors), `node.json`, `web.json` and `studio.json`.
  A package uses `"extends": "@halonicjs/tooling-config/tsconfig/<preset>.json"`.
- **Biome** (`biome.jsonc`): formatting and lint rules, extended by the
  root `biome.json`.
- **Vitest preset** (`@halonicjs/tooling-config/vitest`):

  ```ts
  import { definePackageTestConfig } from "@halonicjs/tooling-config/vitest";

  export default definePackageTestConfig();
  ```
