/** Whether a run is a real run or part of a workflow test. */
export type RunKind = "run" | "test";

/**
 * Where a run is: still going, waiting for an event or a timer, or ended.
 * `cant-try` is a Try it or Test run that ended at a step it couldn't try,
 * because the step needs a change left out of it (see {@link CantTryStep}).
 * It never counts as `completed`, and a real failure in the same run makes
 * it `failed` instead.
 */
export type RunStatus = "running" | "waiting" | "completed" | "failed" | "cant-try";

/**
 * Why one change to review is left out of Try it and Test. A file has
 * exactly one reason: `before-trust` wins over the others.
 *
 * - `before-trust`: written before the workspace was trusted; the whole file stays at its baseline.
 * - `permissions`: the tool list, `tools.approve`, the step limit or the budget.
 * - `trust-and-sandbox`: the network allowlist or folders.
 * - `connections`: which ones, a connector or MCP definition, or a secret mapping.
 * - `models`: `models.yaml`, a provider address, headers, a key mapping or new aliases.
 */
export type LeftOutReason =
  | "before-trust"
  | "permissions"
  | "trust-and-sandbox"
  | "connections"
  | "models";

/**
 * Why a step can't be tried:
 *
 * - `needs-left-out-change`: it uses a change left out of the run, such as a
 *   new alias or connection; `path` is the file of that change.
 * - `invalid-without-change`: the item doesn't load with the baseline value of
 *   the file at `path`; `message` says why, for "Details" only.
 */
export type CantTryReason =
  | { kind: "needs-left-out-change"; path: string; leftOut: LeftOutReason }
  | { kind: "invalid-without-change"; path: string; message: string };

/**
 * A step a Try it or Test run didn't run, because leaving a change out
 * breaks it, instead of quietly using the change (requirement
 * `events.run-cant-try`). It ends its branch the way a failed step does.
 */
export interface CantTryStep {
  status: "cant-try";
  /** The path of the item being tried. */
  item: string;
  /** The step's id, or `null` when the whole item can't be tried. */
  step: string | null;
  reason: CantTryReason;
}

/**
 * Tokens one model call used, or the sum over a run. Providers with a prompt
 * cache charge the tokens read from it and written to it at their own rates,
 * so those are counted apart and are not in `inputTokens`.
 */
export interface Usage {
  /** Input tokens the cache didn't serve or store. */
  inputTokens: number;
  outputTokens: number;
  /** Input tokens read from the provider's prompt cache. Absent when there were none. */
  cacheReadTokens?: number;
  /**
   * Input tokens written to the provider's prompt cache for its short
   * lifetime (Anthropic: 5 minutes). Absent when there were none.
   */
  cacheWriteTokens?: number;
  /**
   * Input tokens written to the provider's prompt cache for 1 hour, which
   * costs more than a short write. Absent when there were none.
   */
  cacheWrite1hTokens?: number;
}

/** What started a run. Absent for runs started by hand from a workflow. */
export interface RunTrigger {
  /** `inbox`: the person started it from the Inbox's request form; `manual`: with Run, or a routine's Run now. */
  type: "manual" | "inbox" | "schedule" | "every" | "mail" | "signal" | "webhook";
  /** Routine key: "<hubId>/<routineId>" or "@workspace/<routineId>". */
  routineId?: string;
  /** ISO time the run was due (the scheduled time, not when it actually started). */
  at: string;
  /** Mail triggers: the Gmail message that started this run (one run per message). */
  messageId?: string;
  /** Signal triggers: "<runId>:<seq>" of the signal that started this run (one run per signal). */
  signalId?: string;
  /** Webhook triggers: the sender's delivery id of the request that started this run (one run per delivery). */
  deliveryId?: string;
  /**
   * Routine runs that started later than the tick's grace after `at`, such
   * as after the computer slept or Halonic was closed. Absent for a run that
   * started on time.
   */
  catchUp?: RunCatchUp;
}

/** How a routine run caught up: what its routine's catch-up rule dropped on the same tick. */
export interface RunCatchUp {
  /**
   * Earlier due times of the routine that the catch-up rule dropped on this
   * tick: the "run once" rule, the 100 cap and the 7-day window. Only the
   * first catch-up run of a tick counts them; later ones have 0. Times
   * skipped because the last run was still going don't count.
   */
  skipped: number;
  /** Set when counting stopped at its limit, so there were at least `skipped`. */
  countIsMinimum?: true;
}

/**
 * Which version of the workspace a run read, as its `run.started` records it
 * (save model 2.2–2.3, HAL-3246):
 * - `live-version`: the live version, at `commit`. `versionDate` is that
 *   version's date, when it was made (the commit's ISO date), not when the
 *   run started, so a run view can say "the version of <date>";
 * - `saved-files`: the files as saved, for Try it and Test, and for every
 *   run while history is off.
 */
export type RunVersion =
  | { reads: "live-version"; commit: string; versionDate: string }
  | { reads: "saved-files" };

/** The run and state that started a child run, and how deep it is (1 = child of a top-level run). */
export interface RunParent {
  runId: string;
  state: string;
  depth: number;
}

/**
 * How a tool call ended: it answered (`ok`), it failed (`error`), or it broke
 * off without an answer, so it may or may not have done its work (`unknown`).
 */
export type ToolOutcome = "ok" | "error" | "unknown";

/**
 * Why the engine didn't make a connector call (requirement
 * `events.tool-result-cause`): `not-connected`, the agent's connector isn't
 * among the run's; `tool-gone`, the connector no longer offers the tool;
 * `sending-off`, the tool sends and sending is off for the connector;
 * `bad-arguments`, the call's arguments aren't an object.
 */
export type ToolNotMadeReason = "not-connected" | "tool-gone" | "sending-off" | "bad-arguments";

/** Why a run's connectors didn't start, when the engine knows (requirement `events.tool-result-cause`). */
export type ConnectorStartReason = "program-missing" | "secret-not-set" | "other";

/**
 * Why a tool call failed, when the engine knows (requirement
 * `events.tool-result-cause`):
 *
 * - `time-limit`: the tool didn't answer within `seconds`.
 * - `engine-stopped`: the engine stopped while the call was going.
 * - `not-made`: the engine didn't make the call, for the reason in `why`.
 * - `connector-not-started`: the run's connectors didn't start. `name` is
 *   the program or the secret's name as the connector's file writes it,
 *   never a secret's value or a program's output.
 *
 * Read it with `toolFailureCauseOf`: a cause it doesn't know reads as absent.
 */
export type ToolFailureCause =
  | { readonly code: "time-limit"; readonly seconds: number }
  | { readonly code: "engine-stopped" }
  | { readonly code: "not-made"; readonly why: ToolNotMadeReason }
  | {
      readonly code: "connector-not-started";
      readonly why: ConnectorStartReason;
      readonly name?: string;
    };

/**
 * Why a model's tool call was refused before it ran (requirement
 * `events.tool-refused`): `not-offered`, the step offered no tool of that name.
 */
export type ToolRefusalReason = "not-offered";

/**
 * Why a connector's tool call ran without asking a person (requirement
 * `events.tool-unasked`): `read-list`, the `read` list of the connector's
 * file names the tool.
 */
export type ToolUnaskedReason = "read-list";

/**
 * Where a payload too large for the run log is kept: the hash of its bytes
 * in the run's blob store, their size and their media type. The same shape
 * as `BlobRef` in `@halonicjs/ports`, which this package may not import.
 */
export interface StoredBlob {
  /** Lowercase hex SHA-256 of the bytes. */
  hash: string;
  /** In bytes. */
  size: number;
  mediaType: string;
}

/**
 * What a tool can do, as its integration's sheet says: `read` changes
 * nothing, `write` changes data, `send` reaches people outside. The same
 * values as `ToolRisk` in `@halonicjs/ports`.
 */
export type ToolRisk = "read" | "write" | "send";

/**
 * What one call of a tool sends, reads or drafts, in the singular and the
 * plural, as its integration's sheet names it, such as
 * `{ one: "email", many: "emails" }`. Both are stored so a reader never has to
 * make a plural itself.
 */
export interface ToolNoun {
  one: string;
  many: string;
}

/**
 * What one call of a tool did to its noun, in the past tense, as its
 * integration's sheet says: "saved" reads "Saved 1 file". A closed list, so a
 * sheet can't word a send as something milder; absent means "sent". `drafted`
 * is for a `write` tool that prepares something without sending it ("Drafted
 * 1 email"), and a `send` tool may never use it.
 */
export type ToolVerb = "sent" | "saved" | "created" | "updated" | "moved" | "drafted";

/**
 * Why a run failed. Each reason has its own requirement in `requirements/`.
 *
 * - `budget`: a run or monthly budget stopped it.
 * - `cancelled`: someone cancelled it.
 * - `model-missing`: the model it asked for doesn't exist at its provider.
 * - `model-no-tools`: that model can't call tools and the step offered some.
 * - `error`: something else went wrong; the `error` text says what.
 * - `model-unreachable`: the model's host didn't answer; `run.failed` names it in `host`.
 * - `model-out-of-memory`: the machine running the model ran out of memory for it.
 * - `model-timeout`: the model's provider was reached but gave no first answer in time (5 minutes by default);
 *   `run.failed` names its host in `host` when it is known.
 * - `disk-full`: there was no disk space left to write what the run needed.
 * - `interrupted`: the engine stopped while the run was going, and found it on its next start.
 * - `sandbox-not-ready`: the sandbox check failed, so the step that needs the sandbox didn't
 *   start; `run.failed` gives the check's reason code in `sandboxReason` and the refused agent in `agent`.
 * - `sandbox-start-failed`: the sandbox check had passed, but the sandbox didn't start for this run.
 * - `this-computer-start-failed`: a person set the step's agent to run on this computer, without a
 *   sandbox, and the launcher that starts it there didn't open; `error` is the launcher's own reason.
 * - `harness-start-failed`: the harness program failed to start for this run, or didn't send its
 *   first event within its time limit (60 s by default).
 * - `key-refused`: the model's provider didn't accept its key, or no key was stored for it.
 * - `out-of-credit`: the account at the model's provider has no credit left or reached its limit.
 *   This is never the Halonic budget, which is `budget`.
 * - `provider-busy`: the model's provider was overloaded or asked Halonic to slow down.
 * - `answer-not-an-option`: the agent's output is a `choice`, and its answer wasn't one of the
 *   options.
 * - `harness-unavailable`: the step's agent runs in a harness program, and the engine that ran it
 *   has no harnesses, as in workflow tests, which never start programs.
 * - `local-only`: the workspace is local only, and no model the step could use runs on this
 *   computer, so Halonic called none of them.
 * - `instructions-not-trusted`: the step's harness didn't start, because a person hasn't trusted
 *   the agent's instructions (or they changed since); `run.failed` gives the agent in `agent`,
 *   the pin the check saw in `pin` and whether something was trusted before in `changed`.
 */
export type RunFailureReason =
  | "budget"
  | "cancelled"
  | "model-missing"
  | "model-no-tools"
  | "error"
  | "model-unreachable"
  | "model-out-of-memory"
  | "model-timeout"
  | "disk-full"
  | "interrupted"
  | "sandbox-not-ready"
  | "sandbox-start-failed"
  | "this-computer-start-failed"
  | "harness-start-failed"
  | "key-refused"
  | "out-of-credit"
  | "provider-busy"
  | "answer-not-an-option"
  | "harness-unavailable"
  | "local-only"
  | "instructions-not-trusted";

/**
 * The instructions a harness step started with: the digest of the whole set
 * and each file's digest by name. Only digests, never the text, so a log
 * that is shared doesn't carry what a person wrote.
 */
export interface LoggedInstructionPin {
  readonly digest: string;
  readonly files: Readonly<Record<string, string>>;
}

/**
 * What `run.failed` and a parallel branch's `agent.finished` carry with the
 * reason `instructions-not-trusted` (requirement
 * `events.run-failed-instructions-not-trusted`): the pin the check saw, so a
 * page can ask a person to trust exactly that, and whether a person had
 * trusted instructions for the agent before, so it says "changed" or "not
 * trusted yet" without asking the store again. `changed` is absent when the
 * check didn't answer.
 */
export interface InstructionsRefusal {
  readonly pin: LoggedInstructionPin;
  readonly changed?: boolean;
}

/**
 * Why a harness program didn't start, when the engine knows (requirement
 * `events.run-failed-harness-cause`): `not-installed` when the program isn't
 * on this computer, `signed-out` when it is but no one is signed in to it for
 * the agent. A reader that doesn't know a cause reads it as absent.
 */
export type HarnessStartCause = "not-installed" | "signed-out";

/**
 * How a surface responds to a failure: the kit's error kinds. This package
 * may not import `@halonicjs/std`, so it holds its own list; the engine's
 * type test (requirement `engine.run-failure-cause-of`) fails when it and
 * `ErrorKind` differ.
 */
export type RunFailureKind =
  | "invalid_input"
  | "not_found"
  | "conflict"
  | "unauthenticated"
  | "denied"
  | "limit_reached"
  | "unavailable"
  | "internal";

/**
 * The typed cause of a failed run, for a screen that has to tell one failure
 * from another without reading the free-text `error` (requirement
 * `events.run-failed-cause`), such as Studio's "API off" banner.
 *
 * `kind` is the error kind the failing error carried, one of the kit's eight
 * (the engine's type test keeps {@link RunFailureKind} equal to `ErrorKind`). `code` is a stable
 * string for a cause a screen knows by name, such as `google.api-disabled`;
 * a reader that doesn't know a code still has `kind`. `detail` holds a few
 * short strings that cause names, such as the API, the project and a link
 * that fixes it. It never holds a credential or a provider's own text.
 */
export interface RunFailureCause {
  readonly kind: RunFailureKind;
  readonly code?: string;
  readonly detail?: Readonly<Record<string, string>>;
}

/**
 * The model provider's own error text, kept in the run log for `--debug` and
 * Copy details only (requirement `events.provider-text`). Studio and the
 * command line never show it by default: microcopy 1.4 allows no quoted
 * outside text in a message. The provider shortened it and checked it for
 * keys before the engine logged it.
 */
export interface ProviderText {
  /** The HTTP status the text came with; left out for a stream error that has none. */
  status?: number;
  text: string;
}

/**
 * Why a model was skipped before it was called: its provider's key isn't set
 * (`no-key`), or the workspace is local only and the provider isn't local
 * (`local-only`).
 */
export type ModelSkipReason = "no-key" | "local-only";

/**
 * Who resolved an approval: a person at the screen, a person on a remote
 * device (a phone), or a rule that answers without asking anyone.
 */
export type ApprovalResolver = "person" | "remote-device" | "rule";
