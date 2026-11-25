/**
 * The nightly click test of the installed Studio on main (HAL-18356).
 * `scheduled.yml` starts a nightly run of `studio-preview.yml` only when the
 * installed app's sources changed since the last one, and the next night `main-failures`
 * reads its jobs with the other runs on main.
 */

/**
 * The start of the run name `studio-preview.yml` gives a nightly run, which
 * tells it from every other run. The full name is
 * `Nightly click test of <build-ref>`.
 */
export const nightlyClickTestTitle = "Nightly click test";

/**
 * The commit a nightly click test built its installer from, read from its run
 * name, or undefined when the name carries none. Not the run's `head_sha`:
 * that is main's tip when the run started, and a desktop-app commit merged
 * after `build-ref` was taken would never be click-tested (HAL-18889).
 */
export function testedCommit(runTitle: string): string | undefined {
  const match = /^Nightly click test of ([0-9a-f]{7,40})$/.exec(runTitle.trim());
  return match?.[1];
}

/**
 * The folders and files whose change makes the next nightly click test run:
 * everything the installed app is built from, not only the Studio's own
 * folders, since the agent host bundles the engine, its adapters and the Node
 * target, and a break there shows on the installed app as much as a Studio
 * one (HAL-18864). Also the click test itself, its workflow and the lockfile,
 * so a new step or a dependency bump gets its night.
 */
export const clickTestPaths: readonly string[] = [
  "apps/studio/",
  "apps/agent-host/",
  "packages/core/",
  "packages/adapters/",
  "packages/host/",
  "packages/studio/",
  "packages/targets/node/",
  "packages/testing/studio-click-test/",
  ".github/workflows/studio-preview.yml",
  "pnpm-lock.yaml",
];

/**
 * Whether tonight's click test runs: always when there was none before,
 * otherwise only when a file under `clickTestPaths` changed since the last
 * one. `changedSinceLast` is undefined when there was none. A nightly that
 * runs runs every step, never only the ones a change touched.
 */
export function needsClickTest(changedSinceLast: readonly string[] | undefined): boolean {
  if (changedSinceLast === undefined) {
    return true;
  }
  return changedSinceLast.some((file) => clickTestPaths.some((path) => file.startsWith(path)));
}
