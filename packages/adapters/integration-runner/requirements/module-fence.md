# integration-runner.module-fence

- Status: active
- Since: 0.1.0
- Source: HAL-983 (design HAL-958, section 5, attack case A34)

Before the runner imports an integration, it shall put a module hook in place that allows an import or require only when it names a file, or `zod`, and resolves to a file inside the integration's folder. Node's own modules by any name (including `node:module`, so no `createRequire`), `data:`, `blob:` and other URLs, other packages, and paths out of the folder are refused. The runner shall also remove `process.getBuiltinModule` before the integration loads.

The hook is one more layer behind the loader's static import checks and the fence: it holds with Node's permission layer off. A path out of the folder is refused before Node resolves it, so Node never looks at it.

`zod` resolves the usual way, so it must be inside the integration's folder (its own `node_modules`). Giving local integrations the runner's own copy of Zod would widen Zod's `allowedIn` and is left to a later decision.

## Examples

- Given an integration that imports `node:fs`, `fs`, `node:module`, a `data:` URL, another package or `../` out of its folder, or a CommonJS file of its own that requires `fs`,
  when its tool runs in the built runner, with or without Node's permission layer,
  then the import is refused by the module hook.
- Given an integration that reads `process.getBuiltinModule`,
  when its tool runs in the built runner,
  then it finds nothing there.
- Given an integration whose files import each other, with `./` and `../` inside its folder,
  when its tool runs in the built runner,
  then they load.
