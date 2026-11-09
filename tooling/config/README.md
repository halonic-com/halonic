# @halonicjs/tooling-config

Shared settings every package extends.

- **Layer:** tooling
- **Owner:** mateo
- **TypeScript presets** (`tsconfig/`): `base.json` (strict settings, Node's
  type stripping rules: `.ts` import extensions, erasable syntax only),
  `core.json` (Web-standard types only, below), `host.json` (those types
  and their values: host packages, Workers code and adapters that run
  anywhere), `node.json`, `web.json` and `studio.json`.
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

  Test hygiene, proven by `src/test-hygiene.test.ts`:
  - A test that never calls `expect()` fails, and a package can't turn
    that off (`definePackageTestConfig` throws).
  - A skipped or todo test fails the run, however it is written (`it.skip`,
    `it.todo`, `skipIf`, `ctx.skip()`). Biome's `noSkippedTests` catches the
    common spellings at lint time; the reporter catches the rest.
  - A test file that never ran fails the run, and the failure names it.
    On a busy machine a worker can miss Vitest's 60 seconds to start (jsdom
    files first); without this the run would fail only on coverage, with a
    different number each time.
  - Tests end in `.test.ts(x)`. A `.spec.ts` file is a helper that tests
    import; the preset doesn't run it, so it must hold no tests.
  - In a package that lists `fast-check`, every property runs with a fixed
    seed (`src/fast-check-setup.ts`), so each run checks the same inputs and
    makes the same `expect` calls. Without it the requirement guard would
    see a different count from the merge base's at random. To try other
    inputs, set `FAST_CHECK_SEED` to another whole number (a failure prints
    the seed to replay) or to `random` for a new seed on every run. A seed
    passed to `fc.assert` itself still wins.
