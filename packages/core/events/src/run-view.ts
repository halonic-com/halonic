import type { RunStatus } from "./run-basics.ts";

// The run view is what an end user of a many-user deployment sees of a run
// (requirement `events.run-view`). It is built only by `toRunView` and
// `toRunViewEvents`, which copy allowed fields one by one: never spread a
// summary or an event into it.

/**
 * The shape of the answer an {@link AnswerHandle} takes, a closed set:
 *
 * - `approve-or-reject`: the payload is `{ approved: boolean }`.
 * - `choice`: the payload is `{ choice: number }`, an index into `choices`.
 * - `message`: the payload is `{ text: string }`, at most `maxLength` characters.
 */
export type AnswerPayloadSchema =
  | { readonly type: "approve-or-reject" }
  | { readonly type: "choice"; readonly choices: readonly string[] }
  | { readonly type: "message"; readonly maxLength: number };

/**
 * An answer an end user sends with a handle; its shape is the handle's
 * {@link AnswerPayloadSchema}.
 */
export type AnswerPayload =
  | { readonly approved: boolean }
  | { readonly choice: number }
  | { readonly text: string };

/**
 * An opaque handle for one answer a run accepts from an end user. The deployment makes the
 * `handle` and keeps what it stands for; the end user sends it back with a payload, never an
 * event name, a call id or a state. `kind`: an `approval` of a tool call, a `question` of a wait
 * step, or the next chat `message`.
 */
export interface AnswerHandle {
  readonly handle: string;
  readonly kind: "approval" | "question" | "message";
  readonly payloadSchema: AnswerPayloadSchema;
}

/**
 * What a handle stands for, for the deployment only: it is never sent to an end user.
 * `toRunView` names each waiting point with it and asks the deployment for its handle.
 * A question's `events` are in choice order; a message's `event` takes `{ text }`.
 */
export type WaitingPoint =
  | { readonly kind: "approval"; readonly callId: string }
  | { readonly kind: "question"; readonly state: string; readonly events: readonly string[] }
  | { readonly kind: "message"; readonly state: string; readonly event: string };

/** One thing a run waits on an end user for: its handle, and the words to show with it. */
export interface RunViewAsk {
  readonly answer: AnswerHandle;
  /** For a question, the wait step's title; for an approval, the seller's approval text. */
  readonly title: string;
  /** For a question, the wait step's body; `""` otherwise. */
  readonly body: string;
}

/**
 * Why a run failed, a closed set; never the error's own text (requirement `events.run-view`).
 * `limit`: the plan's stop code, such as `plan.runs`, or `budget`. `connection`: the
 * connection's name, such as `google`.
 */
export type RunViewFailure =
  | { readonly cause: "stopped" }
  | { readonly cause: "limit"; readonly limit: string }
  | { readonly cause: "connection"; readonly connection: string }
  | { readonly cause: "unavailable" }
  | { readonly cause: "other" };

/** A message of the conversation: one the end user sent, or a user-facing answer of the run. */
export interface RunViewMessage {
  readonly from: "you" | "product";
  readonly text: string;
  readonly at: string;
}

/** A file the workflow declares as a result. */
export interface RunViewFile {
  readonly name: string;
  readonly mediaType: string;
  readonly size: number;
}

/**
 * What a run waits for: an end user's answer (`you`), the next chat `message`, a `timer`
 * (see `nextTimer`) or a plan `limit` (see `limit`). `null` while it isn't waiting.
 */
export type RunViewWaitsFor = "you" | "message" | "timer" | "limit" | null;

/** A run as an end user sees it (design 16.4): no prompts, setup, tool calls, states or context. */
export interface RunView {
  readonly id: string;
  /** The exposed workflow's display name, never its id. */
  readonly name: string;
  readonly status: RunStatus;
  readonly startedAt: string;
  readonly endedAt: string | null;
  /** The first line of the end user's first message, at most 80 characters; `null` without one. */
  readonly title: string | null;
  readonly messages: readonly RunViewMessage[];
  /** The context values the workflow declares as results, by name. */
  readonly results: Readonly<Record<string, unknown>>;
  readonly files: readonly RunViewFile[];
  readonly waitsFor: RunViewWaitsFor;
  /** The approvals and questions waiting for the end user, oldest first. */
  readonly asks: readonly RunViewAsk[];
  /** The handle for the next chat message, while the run waits for one. */
  readonly message: AnswerHandle | null;
  /** While waiting for a timer, when it's due (ISO). */
  readonly nextTimer: string | null;
  /** While waiting at a plan limit, the plan's stop code. */
  readonly limit: string | null;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
  /** The run's priced model calls, in the deployment's budget currency. */
  readonly cost: number;
  readonly failure: RunViewFailure | null;
}

/** One event of a run as an end user sees it, from `toRunViewEvents`; `seq` is the run log's. */
export type RunViewEvent = { readonly seq: number; readonly at: string } & (
  | { readonly kind: "started" }
  | { readonly kind: "message"; readonly from: "you" | "product"; readonly text: string }
  | { readonly kind: "file"; readonly file: RunViewFile }
  | { readonly kind: "waiting" }
  | { readonly kind: "answered" }
  | { readonly kind: "completed" }
  | { readonly kind: "failed"; readonly failure: RunViewFailure }
);

/**
 * What the workflow's definition and the `exposed` list say an end user may see of its runs.
 * `answerSteps`: the states whose agent's final answer is shown. `results`: the context keys
 * and file names declared as results. `messageInput`: the start input holding a chat's first
 * message. `messageEvent`: the event a chat's wait step takes the next message as.
 * `approvalTexts`: the seller's approval text by `<connector>/<tool>` (or the bare tool),
 * where `{name}` stands for that argument.
 */
export interface RunViewMarks {
  readonly displayName: string;
  readonly answerSteps: readonly string[];
  readonly results: readonly string[];
  readonly messageInput?: string;
  readonly messageEvent?: string;
  readonly approvalTexts: Readonly<Record<string, string>>;
}
