/**
 * The services and types other features may use. Features import each other only through this
 * file. The app provides `SampleWorkspaceService` for each open folder.
 */
import type {
  ChoiceChange,
  ChoiceProblem,
  KeyProblem,
  LocalModels,
  ModelChoice,
  TestOutcome,
} from "@halonicjs/app";
import type { SecretText } from "@halonicjs/studio-kit";
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
  /** Whether the finished card was shown in an earlier visit, so it is gone now. Read each time. */
  finishedShown(): boolean;
  /** Saves that the finished card was shown, so the next visit doesn't show it. */
  recordFinishedShown(): void;
  /**
   * Opens the New workspace dialog, which the finished card offers as **Start your own workspace**.
   * Without it the app has no such dialog and the card offers no button.
   */
  startOwnWorkspace?(): void;
}

/** The sample facts of the open folder, provided by the app (`first-run.sample-card`). */
export const SampleWorkspaceService: ServiceKey<SampleWorkspace> =
  serviceKey<SampleWorkspace>("first-run.sample");

import type { FirstRun } from "./first-run.ts";

export type { FirstRun } from "./first-run.ts";
export type { SampleProgress, SampleProgressState } from "./sample-progress.ts";

/** The open workspace's first run; the First Run feature provides it. */
export const FirstRunService: ServiceKey<FirstRun> = serviceKey<FirstRun>("first-run");

/**
 * What testing a choice on the model screen found (first-run-flow 3.3):
 * - `not-a-key`: the pasted text can't be a key; nothing was called.
 * - `files`: a workspace file stops the choice, such as its own provider file
 *   for another address; nothing was called.
 * - `tested`: the test call's outcome. Only `ok` carries a `testId`, the one
 *   way to continue with that choice: the tested key stays in memory under it.
 * - `superseded`: a newer test started before this one ended, so this one keeps
 *   no key and gives no outcome, passed or failed; the screen shows the newer one.
 */
export type ModelChoiceTest =
  | { readonly kind: "not-a-key"; readonly problem: KeyProblem }
  | { readonly kind: "files"; readonly problem: ChoiceProblem }
  | { readonly kind: "tested"; readonly outcome: Exclude<TestOutcome, "ok"> }
  | { readonly kind: "tested"; readonly outcome: "ok"; readonly testId: string }
  | { readonly kind: "superseded" };

/**
 * The facts of the trust line under Continue, worked out from the difference
 * between the folder's trust content before and after the change, with
 * nothing written. The screen words them: "Will pass 1 secret to Anthropic.
 * Turns off Local only." or "Will reach Ollama at localhost:11434".
 */
export interface ModelChoicePreview {
  /** The provider the change adds to the trust content; `undefined` when it adds none. */
  readonly reaches:
    | {
        /** Its name, such as "Anthropic". */
        readonly name: string;
        /** How many secrets go to it: 1 with a key, 0 for a local model. */
        readonly secrets: number;
        /** For a local provider, its host and port, such as `localhost:11434`. */
        readonly host: string | undefined;
        readonly local: boolean;
      }
    | undefined;
  /** Whether Continue turns Local only off. */
  readonly localOnlyOff: boolean;
  /**
   * The fingerprint of the trust content after the change, which Continue
   * trusts when the files still lead to it. `undefined` when Continue saves no
   * trust, so the next Run asks as usual: the folder wasn't trusted before, or
   * the change is more than the one provider.
   */
  readonly fingerprint: string | undefined;
}

/**
 * What Continue did:
 * - `ok`: the choice is saved. `changes` are the facts of the "Changed …"
 *   line; `trusted` says whether the folder is trusted now.
 * - not `ok`: the step that failed, and whether the key was saved before it.
 *   A key saved before a failed write stays saved, but the choice isn't: its
 *   edits are taken back.
 */
export type ModelChoiceSaved =
  | { readonly ok: true; readonly changes: readonly ChoiceChange[]; readonly trusted: boolean }
  | {
      readonly ok: false;
      /**
       * `no-test`: no passed test has this id; `no-save`: nothing saves files here, such as the
       * browser demo, so nothing changed; `files`: a file stops the choice; `key`, `write`: saving
       * the key or the files failed.
       */
      readonly failed: "no-test" | "no-save" | "files" | "key" | "write";
      readonly keySaved: boolean;
      /** Why, in plain words for the log; never holds the key. */
      readonly reason: string;
    };

/**
 * Tests a model choice and saves it, for the first run's Pick a model screen.
 * A key is saved only after its test passed, and trust only for what
 * {@link ModelChoiceService.preview} showed.
 */
export interface ModelChoiceService {
  /** Makes the one tiny test call for `choice`, with `key` for a key choice. A new test drops the last one's key. */
  test(choice: ModelChoice, key?: SecretText): Promise<ModelChoiceTest>;
  /** The trust line's facts for a passed test, with nothing written; `undefined` for an unknown `testId`. */
  preview(testId: string): Promise<ModelChoicePreview | undefined>;
  /** Which models Ollama on this computer has downloaded, for the local option's state line. */
  localModels(): Promise<LocalModels>;
  /**
   * Saves the tested choice: the key, then the files, then the trust, but the
   * trust only when the files lead to `shownFingerprint`. The test's key is
   * dropped afterwards, whatever happened. Saving the files saves the whole
   * workspace now, so any other unsaved edit is saved with them, as autosave
   * would a second later.
   */
  continue(testId: string, shownFingerprint: string | undefined): Promise<ModelChoiceSaved>;
}

/** The first run's model choice for the open folder, provided by the app. */
export const ModelChoiceHostService: ServiceKey<ModelChoiceService> =
  serviceKey<ModelChoiceService>("first-run.model-choice");
