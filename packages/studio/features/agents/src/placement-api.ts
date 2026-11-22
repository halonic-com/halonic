/** Where an agent runs on this computer, as the Harness page reads and saves it. */

/**
 * Where an agent's harness runs on this computer, as a person chose it here (Harness › Where it
 * runs; checklist 3.8). `fingerprint` is that of the agent's saved file now: the warning hands it
 * back when the person confirms, so a file that changed while they read is never let out.
 *
 * - `sandbox`: nobody chose On this computer here, or the choice can't be read.
 * - `this-computer`: chosen here, for the file as it is now, at `chosenAt` (ISO text).
 * - `on-hold`: chosen here for an earlier version of the file, so it runs in its sandbox until the
 *   person confirms again. `changedAt` (ISO text) is when the file changed, the time of the newest
 *   version that changed it after the choice, only when the saved file is that version: an edit
 *   saved since, or a file put back as it was, has no time (checklist 3.8).
 */
export type SavedFilePlacement =
  | { readonly runsOn: "sandbox"; readonly fingerprint: string }
  | { readonly runsOn: "this-computer"; readonly fingerprint: string; readonly chosenAt: string }
  | { readonly runsOn: "on-hold"; readonly fingerprint: string; readonly changedAt?: string };

/**
 * {@link SavedFilePlacement}, and whether the agent's file has unsaved changes. A choice is for the
 * saved file, which `halonic run` runs, so the warning asks the person to save first rather than
 * let out a file they aren't looking at.
 *
 * `studioStartsUnfenced` is whether this Studio can itself start an agent outside its sandbox.
 * While it can't, a choice of On this computer is honoured by `halonic serve` only, and the page
 * says so under the choice (HAL-13194).
 */
export type AgentPlacementState = SavedFilePlacement & {
  readonly unsaved: boolean;
  readonly studioStartsUnfenced: boolean;
};

/** What confirming On this computer came to: saved, or the file changed since the warning, and nothing was saved. */
export type ThisComputerChoice =
  | { readonly saved: true }
  | { readonly saved: false; readonly fingerprint: string };
