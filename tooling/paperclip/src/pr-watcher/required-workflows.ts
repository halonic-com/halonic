/**
 * The required workflows besides CI whose failure GitHub refuses a merge
 * for while `ci-ok` is green (HAL-19031): #6247 failed `Guard notes` (no
 * decision note) and #5953 failed `Built-on label`, and both authors read
 * the pull request as green. The watcher reads them from the snapshot's
 * failing checks by job name: the snapshot's page of 25 can't also carry
 * each check's workflow run (merge control's page of 25 timed out with it).
 */

/** A required workflow's job, by its check name, with the workflow people know it by. */
export const requiredJobs: ReadonlyMap<string, string> = new Map([
  ["Decision note and the guard's own paths", "Guard notes"],
  ["built-on-label", "Built-on label"],
]);

/** A required workflow whose newest run on the head failed, and the failing job's name. */
export interface FailedWorkflow {
  readonly workflow: string;
  readonly job: string;
}

/** The required workflows among a head's failing checks, in `requiredJobs` order. */
export function failedRequired(failingChecks: readonly string[]): FailedWorkflow[] {
  return [...requiredJobs]
    .filter(([job]) => failingChecks.includes(job))
    .map(([job, workflow]) => ({ workflow, job }));
}

/** What fixes a failed required workflow, said after its name in the wake comment. */
export function requiredFix(workflow: string): string {
  if (workflow === "Guard notes") {
    return "Add or fix the decision note the run names (`decisions/<branch>.md`) and push; if the note only waits for its signature, that is the reviewer's step, so hand the task on as usual.";
  }
  if (workflow === "Built-on label") {
    return "Add the `built-on:paperclip` label; that runs it again.";
  }
  return "See the run on the pull request.";
}
