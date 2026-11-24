# engine.yaml-free-graph

- Status: active
- Since: unreleased
- Source: HAL-16764, plan revision 2; HAL-17617

The engine's entry point shall not import, by value, the `@halonicjs/app` or `@halonicjs/format` package roots, `@halonicjs/workspace` other than its `./trust-url` entry, `@halonicjs/yaml`, or `yaml`.

## Examples

- Given an engine file with `import { fenceUntrusted } from "@halonicjs/app/model-text"`,
  when the value imports are walked from `src/index.ts`,
  then `packages/core/app/src/index.ts` isn't reached.
- Given an engine file with `import type { Workflow } from "@halonicjs/format"`,
  when the value imports are walked,
  then the import is left out, because it is erased.
- Given an engine file with `const app = await import("@halonicjs/app")`,
  when the engine's sources are checked,
  then the check fails and names that file.
