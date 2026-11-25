import { fileURLToPath } from "node:url";
import type { BuildOptions } from "esbuild";

/**
 * How `build:plugin` bundles the worker, shared with `bundle.test.ts` so the
 * test checks the bundle that ships. The workflow engine (HAL-17774) brings
 * the `yaml` library, which is CommonJS and calls `require("process")`; an
 * ESM bundle has no `require`, so the banner gives it Node's own.
 */
export const workerBuildOptions = {
  entryPoints: [
    fileURLToPath(new URL("./worker.ts", import.meta.url)),
    fileURLToPath(new URL("./manifest.ts", import.meta.url)),
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  loader: { ".yaml": "text" },
  banner: {
    js: 'import { createRequire as __pluginCreateRequire } from "node:module"; const require = __pluginCreateRequire(import.meta.url);',
  },
} satisfies BuildOptions;
