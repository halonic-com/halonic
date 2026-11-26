import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { BuildOptions } from "esbuild";
import { rulesHashPlaceholder } from "../merge-control/rules-hash.ts";
import { pluginVersion } from "./version.ts";

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

/** The merge rules file's name for a plugin version and the bundle's hash (HAL-18337). */
export function decideFileName(version: string, hash: string): string {
  return `merge-control-decide-${version}-${hash}.js`;
}

/**
 * How `build:plugin` bundles the merge rules for the Merger, shared with
 * `decide-file.test.ts`. `neutral` with everything bundled: an import of a
 * Node module fails the build, so the file can't read the clock, network or
 * files behind `decide`'s back, and runs in any ES2022 runtime.
 */
export const decideFileBuildOptions = {
  entryPoints: [fileURLToPath(new URL("../merge-control/decide-file.ts", import.meta.url))],
  bundle: true,
  platform: "neutral",
  format: "esm",
  target: "es2022",
  mainFields: ["module", "main"],
  write: false,
} satisfies BuildOptions;

/**
 * The rules file from the bundle's text: the first 8 hex digits of the
 * SHA-256 of that text name the file and replace the placeholder in
 * `rulesVersion`, so the same rules always get the same name.
 */
export function rulesFile(bundle: string): { name: string; text: string; hash: string } {
  const parts = bundle.split(rulesHashPlaceholder);
  if (parts.length !== 2) {
    throw new Error(
      `the rules bundle holds the hash placeholder ${parts.length - 1} times, expected once`,
    );
  }
  const hash = createHash("sha256").update(bundle).digest("hex").slice(0, 8);
  return { name: decideFileName(pluginVersion, hash), text: parts.join(hash), hash };
}
