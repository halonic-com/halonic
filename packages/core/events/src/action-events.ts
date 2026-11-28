// The events of a user-only action stepper (ADR 2026-11-24, action sender).
// Every field here is on an allow-list (`action-event-check.ts`): an event
// can never carry a token, a header, a value the user typed into an `input`
// step or a whole answer body, because no field can hold one.

/** Who filed an action request. Shown to the user, never trusted. */
export type ActionRequester =
  | { kind: "agent"; agent: string; run: string }
  | { kind: "routine"; routine: string }
  | { kind: "user" };

/** A request parameter's value, or a value the requester expects: plain values only. */
export type ActionParameterValue = string | number | boolean;

/** A field the definition keeps from a successful answer, named one by one. */
export type ActionKeptValue = string | number | boolean | null;

/** Fields every action event has. `request`: the request's id. `at`: when, as ISO 8601 UTC. */
interface ActionEventBase {
  request: string;
  at: string;
}

/**
 * Someone filed a request to run a stepper. An agent may only do this: it
 * runs nothing. `definition` and `version` name the reviewed definition;
 * `parameters` fill it; `expect` is state the requester saw, checked before
 * the run; `reason` is the requester's own text, shown quoted.
 */
export interface ActionRequestedEvent extends ActionEventBase {
  type: "action.requested";
  definition: string;
  version: number;
  parameters: Readonly<Record<string, ActionParameterValue>>;
  requester: ActionRequester;
  reason: string;
  expires: string;
  expect?: Readonly<Record<string, ActionParameterValue>>;
}

/**
 * The user opened the request for review or declined it, or their requester
 * policy blocked it. `digest`: the build-time hash of the definition's source
 * they saw.
 */
export interface ActionReviewedEvent extends ActionEventBase {
  type: "action.reviewed";
  decision: "opened" | "declined" | "blocked";
  digest: string;
}

/** The user signed in to the request's service. The account's name only. */
export interface ActionSignedInEvent extends ActionEventBase {
  type: "action.signed-in";
  service: string;
  account: string;
}

/** The user started step `step` (from 1). */
export interface ActionStepStartedEvent extends ActionEventBase {
  type: "action.step.started";
  step: number;
}

/**
 * A step succeeded with the HTTP `status`; `kept` holds only the fields the definition keeps.
 * Without `status`, Studio sent nothing: the user did the step on the page a guided step opened,
 * or by hand, and said so.
 */
export interface ActionStepSucceededEvent extends ActionEventBase {
  type: "action.step.succeeded";
  step: number;
  status?: number;
  kept: Readonly<Record<string, ActionKeptValue>>;
}

/**
 * Why a step failed. `service-error`: the service answered with a failed
 * status. `refused`: the sender refused the step before sending it.
 * `unreachable`: no answer. `malformed`: the parameters no longer pass the
 * definition's schema. `state-changed`: what the requester expected is no
 * longer so. `more-than-one`: a check's answer listed more than one match,
 * and a step works on exactly one.
 */
export type ActionStepFailure =
  | "service-error"
  | "refused"
  | "unreachable"
  | "malformed"
  | "state-changed"
  | "more-than-one";

/** A step failed and the stepper stopped. `error`: the service's own message, capped, untrusted. */
export interface ActionStepFailedEvent extends ActionEventBase {
  type: "action.step.failed";
  step: number;
  failure: ActionStepFailure;
  status?: number;
  error?: string;
}

/** A check showed that step `step` was already done, so it was not sent. */
export interface ActionStepSkippedEvent extends ActionEventBase {
  type: "action.step.skipped";
  step: number;
}

/** How a request ended. */
export type ActionOutcome = "succeeded" | "failed" | "declined" | "expired";

/** The request ended. Nothing more is written for it. */
export interface ActionFinishedEvent extends ActionEventBase {
  type: "action.finished";
  outcome: ActionOutcome;
}

/**
 * One event of an action request (requirement `events.action-events`).
 * `action.requested` is written by the engine when a request is filed and
 * joins the run log with that filing; the others are written by Studio while
 * the user reviews and runs it, into the request's record outside every
 * workspace, never into a run log.
 */
export type ActionEvent =
  | ActionRequestedEvent
  | ActionReviewedEvent
  | ActionSignedInEvent
  | ActionStepStartedEvent
  | ActionStepSucceededEvent
  | ActionStepFailedEvent
  | ActionStepSkippedEvent
  | ActionFinishedEvent;

/**
 * `action.requested` as a run log line (requirement
 * `events.action-requested-run-event`): the same fields but `at`, since the
 * line's own `at` is when the engine filed it.
 */
export type ActionRequestedRunEvent = Omit<ActionRequestedEvent, "at">;

/**
 * An event of a request's record, which Studio keeps outside every workspace
 * through the `ActionRecords` port: every action event but `action.requested`.
 */
export type ActionRecordEvent = Exclude<ActionEvent, ActionRequestedEvent>;

/** The name of an action event, such as `"action.step.started"`. */
export type ActionEventType = ActionEvent["type"];
