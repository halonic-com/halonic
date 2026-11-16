import type { SampleWorkspace } from "./api.ts";
import { SampleProgress, type SampleRuns } from "./sample-progress.ts";

/**
 * The first run of one open workspace. Whether the folder is the sample is only known once the
 * window has marked it, which is after the folder opened, so the sample's {@link SampleProgress}
 * is built the first time Home asks for it, and only for a sample.
 */
export class FirstRun {
  readonly #runs: SampleRuns;
  readonly #workspace: SampleWorkspace;
  #progress: SampleProgress | undefined;

  constructor(runs: SampleRuns, workspace: SampleWorkspace) {
    this.#runs = runs;
    this.#workspace = workspace;
  }

  /** Whether the open folder is the Acme sample, which gets the Try the sample card. */
  get isSample(): boolean {
    return this.#workspace.isSample();
  }

  /** The sample's progress, or `undefined` when the folder isn't the sample. */
  progress(): SampleProgress | undefined {
    if (!this.isSample) return undefined;
    this.#progress ??= new SampleProgress(this.#runs, this.#workspace);
    return this.#progress;
  }

  /** Stops following the runs, when the workspace closes. */
  dispose(): void {
    this.#progress?.dispose();
  }
}
