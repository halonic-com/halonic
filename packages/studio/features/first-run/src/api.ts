/**
 * The services and types other features may use. Features import each other only through this
 * file. The app provides `SampleWorkspaceService` and `FirstRunDeviceService` for each open folder.
 */
import type { ModelChoiceService } from "@halonicjs/app";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { OwnCardMemory } from "./own-progress.ts";

export type { OwnCardMemory } from "./own-progress.ts";

/** The three steps of the Try the sample card, in the order the card lists them. */
export const sampleSteps = ["start", "decide", "see"] as const;

/** One step of the Try the sample card. */
export type SampleStepId = (typeof sampleSteps)[number];

/** What the app tells the first run about the folder open in the window. */
export interface SampleWorkspace {
  /** Whether this device remembers the folder as created from the Acme sample. Read each time. */
  isSample(): boolean;
  /**
   * Calls `listener` when the device starts remembering the folder as the demo while it is open,
   * as **Open demo** does for a folder that is open already. Returns a function that stops the
   * calls. Absent where the app can't tell. Only a mark in this window counts: Recent doesn't hear
   * another window's.
   */
  onMarkedSample?(listener: () => void): () => void;
  /** The steps done in this folder, as saved on this device: a step stays done. */
  doneSteps(): readonly SampleStepId[];
  /** Saves that a step is done in this folder. */
  recordDone(step: SampleStepId): void;
  /** Whether the finished card was shown in an earlier visit, so it is gone now. Read each time. */
  finishedShown(): boolean;
  /** Saves that the finished card was shown, so the next visit doesn't show it. */
  recordFinishedShown(): void;
  /** What this device remembers of the folder's Get set up card (`first-run.own-card`). Read each time. */
  ownCardMemory(): OwnCardMemory;
  /** Saves what to remember of the folder's Get set up card, for the next visit to Home. */
  recordOwnCard(memory: OwnCardMemory): void;
  /**
   * Opens the New workspace dialog, which the finished card offers as **Start your own workspace**.
   * Without it the app has no such dialog and the card offers no button.
   */
  startOwnWorkspace?(): void;
}

/** The sample facts of the open folder, provided by the app (`first-run.sample-card`). */
export const SampleWorkspaceService: ServiceKey<SampleWorkspace> =
  serviceKey<SampleWorkspace>("first-run.sample");

/**
 * Where the first run's state lives on this device (`first-run.state`), for the folder open in
 * the window; the app provides it. The state is one for the device, not one per folder: it names
 * the folder its first run is in.
 */
export interface FirstRunDevice {
  /** The open folder, as this device names it (its location); the same each time it opens. */
  readonly folder: string;
  /** The state as last saved, or `undefined` when none was saved or it can't be read. */
  read(): string | undefined;
  /** Saves the state. A save that fails keeps the old one; the window goes on with the new one. */
  write(text: string): void;
  /**
   * Calls `listener` when another window saved the state: a folder open there stays shown, so it
   * isn't shown again. Returns a function that stops the calls. Absent where the app can't tell.
   */
  onChanged?(listener: () => void): () => void;
  /**
   * Copies the demo again into the next free folder and opens it, as the demo chip's **Fresh copy
   * of the demo** does, for **Help › First run › Start over**. Calls `copied` once the copy is
   * written, before it opens; never when it can't be written. Absent where the app can't.
   */
  startOver?(copied: () => void): void;
}

/** The first run's place on this device, provided by the app for each open folder. */
export const FirstRunDeviceService: ServiceKey<FirstRunDevice> =
  serviceKey<FirstRunDevice>("first-run.device");

import type { FirstRun } from "./first-run.ts";

export type { FirstRun } from "./first-run.ts";
export type { FirstRunState, FirstRunStep } from "./first-run-state.ts";

/** The open workspace's first run; the First Run feature provides it. */
export const FirstRunService: ServiceKey<FirstRun> = serviceKey<FirstRun>("first-run");

export type {
  ModelChoiceLine,
  ModelChoicePreview,
  ModelChoiceSaved,
  ModelChoiceService,
  ModelChoiceTest,
} from "@halonicjs/app";

/** The first run's model choice for the open folder, provided by the app. */
export const ModelChoiceHostService: ServiceKey<ModelChoiceService> =
  serviceKey<ModelChoiceService>("first-run.model-choice");
