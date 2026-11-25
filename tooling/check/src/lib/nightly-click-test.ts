/**
 * The nightly click test of the installed Studio on main (HAL-18356).
 * `scheduled.yml` starts a nightly run of `studio-preview.yml` only when the
 * desktop app changed since the last one, and the next night `main-failures`
 * reads its jobs with the other runs on main.
 */

/** The run name `studio-preview.yml` gives a nightly run, which tells it from every other run. */
export const nightlyClickTestTitle = "Nightly click test";

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
