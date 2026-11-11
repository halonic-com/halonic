# integration-runner.module-fence

- Status: active
- Since: 0.1.0
- Source: HAL-983 (design HAL-958, section 5, attack case A34)

When the runner imports an integration, it shall first put a module hook in place that allows an import or require only when it names a file, or `zod`, and resolves to a file inside the integration's folder. Node's own modules by any name (including `node:module`, so no `createRequire`), `data:`, `blob:` and other URLs, other packages, native add-ons (`.node` files, even inside the folder), and paths out of the folder are refused. The runner shall also remove `process.getBuiltinModule` before the integration loads.

The hook is one more layer behind the loader's static import checks and the fence: for imports and requires, it holds with Node's permission layer off. A path out of the folder is refused before Node resolves it, so Node never looks at it. The hook does not cover Node's ways into native code that skip imports: `process.binding`, `process._linkedBinding` and `process.dlopen`. Only Node's permission layer and the fence stop those.

The hook needs the folder's real path: Node resolves a module to its real path, so through a symlink the hook would refuse the integration's own files.

`zod` resolves the usual way, so it must be inside the integration's folder: in its own `node_modules`, or bundled into its entry file. Integrations never get the runner's own copy of Zod: that would hand untrusted code the Zod instance the runner checks Halonic's frames with, and an integration could patch its prototypes to weaken the runner's own checks.

## Examples

- Given an integration that imports `node:fs`, `fs`, `node:module`, a `data:` URL, another package or `../` out of its folder, or a CommonJS file of its own that requires `fs` or a native add-on in its folder,
  when its tool runs in the built runner, with or without Node's permission layer,
  then the import is refused by the module hook.
- Given an integration that reads `process.getBuiltinModule`,
  when its tool runs in the built runner,
  then it finds nothing there.
- Given an integration whose files import each other, with `./` and `../` inside its folder,
  when its tool runs in the built runner,
  then they load.
