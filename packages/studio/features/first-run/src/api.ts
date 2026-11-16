/**
 * The services and types other features may use. Features import each other only through this
 * file. The app provides `SampleWorkspaceService` for each open folder.
 */
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/** The three steps of the Try the sample card, in the order the card lists them. */
export const sampleSteps = ["start", "decide", "see"] as const;

/** One step of the Try the sample card. */
export type SampleStepId = (typeof sampleSteps)[number];

/** What the app tells the first run about the folder open in the window. */
export interface SampleWorkspace {
  /** Whether this device remembers the folder as created from the Acme sample. Read each time. */
  isSample(): boolean;
  /** The steps done in this folder, as saved on this device: a step stays done. */
  doneSteps(): readonly SampleStepId[];
  /** Saves that a step is done in this folder. */
  recordDone(step: SampleStepId): void;
}

/** The sample facts of the open folder, provided by the app (`first-run.sample-card`). */
export const SampleWorkspaceService: ServiceKey<SampleWorkspace> =
  serviceKey<SampleWorkspace>("first-run.sample");

import type { FirstRun } from "./first-run.ts";

export type { FirstRun } from "./first-run.ts";
export type { SampleProgress, SampleProgressState } from "./sample-progress.ts";

/** The open workspace's first run; the First Run feature provides it. */
export const FirstRunService: ServiceKey<FirstRun> = serviceKey<FirstRun>("first-run");
