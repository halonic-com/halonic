import { readFileSync } from "node:fs";
import { checkNodeRuntime } from "../node-runtime.ts";

/**
 * Used by the Release workflow (HAL-20054): fails when Node has published a
 * security release in the line of the Node runtime we bundle that is newer
 * than the one in pnpm-lock.yaml. Offline it warns and passes.
 *
 * node tooling/publish/src/cli/check-node-runtime.ts [pnpm-lock.yaml]
 */
const releasesUrl = "https://nodejs.org/download/release/index.json";

const result = await checkNodeRuntime(
  readFileSync(process.argv[2] ?? "pnpm-lock.yaml", "utf8"),
  async () => {
    const response = await fetch(releasesUrl, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  },
);
console.log(result.message);
if (!result.ok) process.exitCode = 1;
