// What the engine needs from the host to run a writer step under the early
// hedge (requirement `engine.harness-early-hedge`): the pilot's settings, a
// files folder for each attempt, and where its decisions go. The host knows
// which model and provider an agent's alias reaches, and owns the folders,
// so the engine only asks.

import type { EarlyHedgeConfig, HedgeDecision, WriterSetup } from "@halonicjs/retry-detectors";
import type { HarnessAgent } from "./harness-host.ts";

/** The files folder one attempt writes in, made at the version the run's files were at. */
export interface AttemptFolder {
  /** The folder's absolute path, which the attempt gets as its `filesFolder`. */
  readonly path: string;
  /**
   * What the attempt changed in it, as a unified diff against the version it was made at.
   *
   * @throws when the folder can't be read
   */
  diff(): Promise<string>;
  /**
   * Applies what the attempt changed to the run's own files folder.
   *
   * @throws when the change can't be applied; the step then fails
   */
  ship(): Promise<void>;
  /** Removes the folder. The engine calls it once the step has ended, whatever the outcome; it doesn't throw. */
  release(): Promise<void>;
}

/** The files folders of a hedged writer step. */
export interface AttemptFolders {
  /**
   * The version the run's own files folder is at now, as text the engine
   * only compares: the step ships nothing once it moved.
   *
   * @throws when the folder can't be read
   */
  versionOf(agent: HarnessAgent): Promise<string>;
  /**
   * Makes the folder of attempt `attempt` (from 1) at `version`.
   *
   * @throws when the folder can't be made; that attempt then fails
   */
  open(agent: HarnessAgent, attempt: number, version: string): Promise<AttemptFolder>;
}

/**
 * One decision of a hedged writer step: the policy's own, or that an
 * attempt asked for a person's OK and was stopped for it, which isn't a
 * model failure, or that the run's files moved, so nothing shipped.
 */
export type HedgeStepDecision =
  | HedgeDecision
  | { readonly kind: "approval-requested"; readonly attempt: number; readonly atSeconds: number }
  | { readonly kind: "files-moved"; readonly attempt: number };

/** The early hedge of the DeepSeek writer pilot, as the host sets it up. */
export interface EarlyHedgeHost {
  /** The pilot's settings; with `enabled` off, the default, no step runs under the hedge. */
  readonly config: EarlyHedgeConfig;
  readonly folders: AttemptFolders;
  /** The model alias the step runs on once no attempt can ship, such as `opus`. */
  readonly fallbackModel: string;
  /**
   * The agent, model and provider a harness agent runs on, or `null` when
   * the host can't tell; the step then runs once, as without the hedge.
   *
   * @throws when the workspace's model files can't be read
   */
  setupOf(agent: HarnessAgent): Promise<WriterSetup | null>;
  /** Hears each decision as it is made, for the decision log. */
  decided?(decision: HedgeStepDecision): void;
  /** The clock in milliseconds, as the policy reads it; `Date.now` by default. */
  now?(): number;
}
