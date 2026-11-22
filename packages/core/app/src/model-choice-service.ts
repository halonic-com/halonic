/**
 * The contract of the first run's model choice (first-run-flow 3.3): what the Pick a model screen
 * calls, and the parts an implementation reads and writes. It lives here, not in Studio, so the
 * desktop app and `halonic serve` can share one implementation (HAL-14808).
 */

import type { LocalModels } from "./local-models.ts";
import type { FirstRunKeyProvider, KeyProblem, ModelChoice } from "./model-choice.ts";
import type { ChoiceChange, ChoiceProblem } from "./model-choice-edits.ts";
import type { TestOutcome } from "./model-choice-reply.ts";

/**
 * A pasted key that doesn't show itself: printing or serializing it gives a placeholder, never the
 * key. Studio's `SecretText` is one.
 */
export interface ChoiceKey {
  /** The key itself. Call it only in the request that uses or saves it. */
  reveal(): string;
  /** Whether nothing was pasted, without revealing the key. */
  readonly isEmpty: boolean;
}

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
 * The trust line's facts for a choice before its test, so the line shows under
 * Test and continue before it is pressed. It gives no fingerprint: Continue
 * trusts only what {@link ModelChoiceService.preview} gave for the passed test,
 * so the screen compares the two lines and asks again when they differ.
 */
export type ModelChoiceLine = Omit<ModelChoicePreview, "fingerprint">;

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
  /**
   * Makes the one tiny test call for `choice`, with `key` for a key choice. Without `key`, a key
   * choice is tested with the key saved for it on this computer, which Continue then leaves as it
   * is; `not-a-key` when none is saved. A new test drops the last one's key.
   */
  test(choice: ModelChoice, key?: ChoiceKey): Promise<ModelChoiceTest>;
  /** Whether a key is saved on this computer for the provider, for "A key is saved for …". */
  keySaved(provider: FirstRunKeyProvider): Promise<boolean>;
  /** The trust line's facts for `choice` before its test; `undefined` when a file stops the choice. */
  lineFacts(choice: ModelChoice): Promise<ModelChoiceLine | undefined>;
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

/** The workspace files a model choice reads, with unsaved changes applied. */
export interface ModelChoiceFileReads {
  /** The text of `models.yaml`; `null` when the workspace has none. */
  readModels(): Promise<string | null>;
  /** The text of `workspace.yaml`; `null` when the workspace has none. */
  readWorkspace(): Promise<string | null>;
  /** The text of one provider file, such as `providers/anthropic.yaml`; `null` when it is gone. */
  readProvider(path: string): Promise<string | null>;
}

/** Where a model choice saves a tested key: write-only, nothing reads a key back. */
export interface ModelChoiceKeySave {
  /** Stores the key under the secret name, replacing any. It rejects when it can't; the key is never in the error. */
  save(secretName: string, key: ChoiceKey): Promise<void>;
}
