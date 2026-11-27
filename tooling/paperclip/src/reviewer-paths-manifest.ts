/**
 * Which changed files build a Paperclip plugin manifest (HAL-19440,
 * HAL-19469). The same list as the plugin deployer's `touchesManifest`
 * (server `plugin-deployer/gates.mjs`, `MANIFEST_PARTS` and
 * `MANIFEST_IMPORTS`), so the Merger asks for the approvals the deployer
 * does. Kept apart from `reviewer-paths.ts` for its size; the live Merger
 * loads it with it, so it has no runtime imports.
 */

/**
 * The plugin manifests' own modules: `manifest.ts` and the declaration and
 * settings modules next to it, tests excluded.
 */
const manifestModule =
  /^tooling\/paperclip\/src\/(?:plugin|seats\/plugin)\/[^/]*(?:manifest|declaration|settings)[^/]*\.ts$/;

/**
 * The rest of the manifests' import closure, whose names don't match
 * `manifestModule`, and the build files that bundle `dist/manifest.js`
 * with everything they import.
 * A module one import further down shapes the built manifest as much as a
 * direct one: a default in `seat-mover/settings.ts` decides what the seat
 * mover job may do. `reviewer-paths-manifest.test.ts` walks the closure as
 * esbuild bundles it, and the build scripts' own imports, and fails when
 * this list misses a module or names one that left them. Keep it in step with the deployer's `MANIFEST_IMPORTS`.
 */
export const manifestImports: readonly string[] = [
  "tooling/paperclip/src/amsterdam-time.ts",
  "tooling/paperclip/src/board-check/failed-runs.ts",
  "tooling/paperclip/src/front-bot/lookups.ts",
  "tooling/paperclip/src/front-bot/prompt.ts",
  "tooling/paperclip/src/front-bot/run-choice.ts",
  "tooling/paperclip/src/front-bot/settings.ts",
  "tooling/paperclip/src/merge-control/budget.ts",
  "tooling/paperclip/src/plugin/front-bot-notes.ts",
  "tooling/paperclip/src/plugin/version.ts",
  "tooling/paperclip/src/seat-mover/settings.ts",
  "tooling/paperclip/src/task-effort/settings.ts",
  "tooling/paperclip/src/verdicts/record.ts",
  "tooling/paperclip/src/worker-agents/keys.ts",
  "tooling/paperclip/src/worker-agents/tables.ts",
  // The build: the scripts and options that bundle the manifests, and the package's pointer to them.
  "tooling/paperclip/package.json",
  "tooling/paperclip/src/plugin/build-options.ts",
  "tooling/paperclip/src/plugin/build.ts",
  "tooling/paperclip/src/seats/plugin/build.ts",
  // What the build scripts import at run time: their code runs while `dist/manifest.js` is written (HAL-19527).
  "tooling/paperclip/src/merge-control/rules-hash.ts",
];

/**
 * The first changed file that builds a plugin manifest, or undefined when
 * none does. Such a pull request needs Julian's approval on its head as well
 * as its reviewer's (`reviewerFor`), whoever that is (HAL-19440).
 */
export function manifestFileOf(files: readonly string[]): string | undefined {
  return files.find(
    (path) =>
      (manifestModule.test(path) && !path.endsWith(".test.ts")) || manifestImports.includes(path),
  );
}
