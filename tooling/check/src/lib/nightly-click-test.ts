/**
 * The nightly click test of the installed Studio on main (HAL-18356).
 * `scheduled.yml` starts a nightly run of `studio-preview.yml` only when the
 * desktop app changed since the last one, and the next night `main-failures`
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

/** The folders whose change makes the next nightly click test run. */
export const clickTestPaths: readonly string[] = [
  "apps/studio/",
  "apps/agent-host/",
  "packages/studio/",
];

/**
 * Whether tonight's click test runs: always when there was none before,
 * otherwise only when a file under `clickTestPaths` changed since the last
 * one. `changedSinceLast` is undefined when there was none.
 */
export function needsClickTest(changedSinceLast: readonly string[] | undefined): boolean {
  if (changedSinceLast === undefined) {
    return true;
  }
  return changedSinceLast.some((file) => clickTestPaths.some((path) => file.startsWith(path)));
}
