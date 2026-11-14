// Where the built runner is (design HAL-958, section 7). `pnpm build` writes
// it to `dist/runner.mjs` in this package; a host that starts runners asks
// here instead of knowing the layout. It says nothing about whether the
// file is there: a start refuses when it isn't (HAL-8089).

import { fileURLToPath } from "node:url";

/**
 * The absolute path of the built runner, `dist/runner.mjs` of this package.
 * The file exists only after `pnpm build`.
 *
 * @example
 * runnerFile(); // "/work/halonic/packages/adapters/integration-runner/dist/runner.mjs"
 */
export function runnerFile(): string {
  return fileURLToPath(new URL("../../dist/runner.mjs", import.meta.url));
}
