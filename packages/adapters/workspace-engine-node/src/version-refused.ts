// Why the workspace engine can't read a version a run asks for. Its callers
// word it for their people (the CLI says it with `runMessages` and
// `routinesMessages`, HAL-17054), so the refusal carries the data a sentence
// needs and no sentence of its own.

import { type ErrorKind, KindedError } from "@halonicjs/std";

/** Why a version can't be read or may not run, with what a sentence about it names. */
export type VersionRefusal =
  /** The workspace has history, but git can't start; the error's `cause` says why. */
  | { readonly reason: "history-unavailable" }
  /** The workspace has history, but nothing is live yet. */
  | { readonly reason: "nothing-live" }
  /**
   * The version turns local only on or off, which a running watch can't
   * change. `savedNow` when the saved workspace.yaml turns it on now,
   * `savedAtStart` when it was on only through that file when the watch started.
   */
  | {
      readonly reason: "local-only-changed";
      readonly savedNow: boolean;
      readonly savedAtStart: boolean;
    }
  /** A run reads a commit of a workspace whose history wasn't opened. */
  | { readonly reason: "no-history-for-version"; readonly commit: string }
  /** The version a run reads has no such agent file. */
  | { readonly reason: "no-agent-file"; readonly hubId: string; readonly agentId: string }
  /** The version a run reads has no such skill. */
  | { readonly reason: "no-skill"; readonly hubId: string; readonly skillId: string }
  /** A run names no version, so its agent's file has nothing to be read from. */
  | { readonly reason: "no-version-for-agent-file"; readonly runId: string };

/**
 * Says that a version can't be read or may not run, as {@link VersionRefusal}
 * says why. Its message is the reason's id, for the log: a caller shows its
 * own sentence.
 */
export class VersionRefusedError extends KindedError {
  readonly refusal: VersionRefusal;

  /** @param cause - the error that stopped the read, such as git failing to start */
  constructor(refusal: VersionRefusal, cause?: unknown) {
    super(kindOf(refusal), refusal.reason, cause === undefined ? {} : { cause });
    this.refusal = refusal;
  }
}

function kindOf(refusal: VersionRefusal): ErrorKind {
  switch (refusal.reason) {
    case "history-unavailable":
      return "unavailable";
    case "nothing-live":
    case "local-only-changed":
      return "conflict";
    case "no-history-for-version":
    case "no-agent-file":
    case "no-skill":
    case "no-version-for-agent-file":
      return "not_found";
  }
}
