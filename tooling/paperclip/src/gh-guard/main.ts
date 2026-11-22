import { runGuard } from "./guard.ts";
import { processDeps } from "./node.ts";

/**
 * The `gh` wrapper's entry point. `pnpm run build:gh-guard` bundles it into
 * `dist/gh-guard/gh`, which the board installs ahead of the real `gh` on
 * the runner's `PATH` (README, "gh guard").
 */
const deps = processDeps(process.argv[1] ?? "");
if (typeof deps === "string") {
  process.stderr.write(deps);
  process.exitCode = 127;
} else {
  void runGuard(deps).then((code) => {
    process.exitCode = code;
  });
}
