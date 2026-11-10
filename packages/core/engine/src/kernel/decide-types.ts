import type {
  AgentResume,
  RunEventBase,
  RunEventBody,
  RunFailureReason,
  RunKind,
  RunParent,
  RunTrigger,
  ToolOutcome,
} from "@halonicjs/events";
import type { Agent, Workflow } from "@halonicjs/format";
import type { ResumeAfterApproval, RunState } from "./run-state.ts";

// `decide` does no input or output and reads no clock. Everything it needs
// from outside comes in here: the time with every input, and a new id with
// the input that needs one (`start` brings the run's id). Call ids are
// counted in the run state, so they need no id generator.

/** The fields every input has. */
interface InputBase {
  /** ISO time the input happened. Events it causes carry this time. */
  readonly at: string;
}

/** Start a run. Only valid before the run has any event. */
export interface StartInput extends InputBase {
  readonly type: "start";
  readonly runId: string;
  readonly hubId: string;
  readonly workflowId: string;
  readonly input: Record<string, unknown>;
  readonly kind: RunKind;
  readonly definitionsVersion: string;
  readonly trigger?: RunTrigger;
  readonly parent?: RunParent;
}

/** An event sent to a waiting run, such as `approve`. */
export interface SendInput extends InputBase {
  readonly type: "send";
  readonly event: string;
  readonly payload?: unknown;
  /** The call the event is meant for; a mismatch is refused (3c). */
  readonly callId?: string;
}

/** A timer the run set is due. */
export interface TimerInput extends InputBase {
  readonly type: "timer";
  /** The key the `set-timer` effect gave it. */
  readonly key: string;
}

/** What a model call answered. Tool calls in the answer arrive with the agent loop (4a). */
export interface ModelResult {
  readonly type: "model";
  readonly output: unknown;
}

/** What a harness run gave as its result: the `output` of its own `agent.finished`. */
export interface HarnessResult {
  readonly type: "harness";
  readonly output: unknown;
}

/** What a tool call returned, and how it ended. */
export interface ToolResult {
  readonly type: "tool";
  readonly result: string;
  readonly outcome: ToolOutcome;
}

/**
 * The agent stopped at a tool call that needs a person's OK. The run waits
 * for `approve` or `reject`, then the agent goes on from `resume`.
 */
export interface ApprovalNeeded {
  readonly type: "approval";
  readonly tool: string;
  readonly args: unknown;
  /** Where the agent stopped; the call that waits for the OK is `resume.calls[0]`. */
  readonly resume: AgentResume;
}

/** What a model call for a state's agent gives: its answer, or a stop for an approval. */
export type ModelCallResult = ModelResult | ApprovalNeeded;

/** An effect `decide` asked for has finished. */
export interface EffectDoneInput extends InputBase {
  readonly type: "effect-done";
  /** The `callId` of the effect that finished. */
  readonly callId: string;
  readonly result: ModelCallResult | HarnessResult | ToolResult;
}

/**
 * An effect `decide` asked for failed, such as a model call with no model
 * left. The run fails with the reason `runFailureReasonOf` gave the error.
 */
export interface EffectFailedInput extends InputBase {
  readonly type: "effect-failed";
  /** The `callId` of the effect that failed. */
  readonly callId: string;
  readonly error: string;
  readonly reason: RunFailureReason;
  /** The host that couldn't be reached, for `model-unreachable`. */
  readonly host?: string;
}

/** How a child run is now, as its parent hears it: waiting for events, or ended. */
export type ChildRunNow =
  | { readonly status: "waiting"; readonly events: readonly string[] }
  | { readonly status: "completed"; readonly context: Record<string, unknown> }
  | { readonly status: "failed"; readonly error: string };

/** A child run a `workflow` state started waits or has ended. */
export type ChildInput = InputBase & {
  readonly type: "child";
  readonly childRunId: string;
} & ChildRunNow;

/** Everything that moves a run on. `step` records each one and passes it to `decide`. */
export type DecideInput =
  | StartInput
  | SendInput
  | TimerInput
  | EffectDoneInput
  | EffectFailedInput
  | ChildInput;

/** Ask a state's agent for its answer to a prompt. */
export interface CallModelEffect {
  readonly type: "call-model";
  readonly callId: string;
  readonly state: string;
  readonly agent: string;
  readonly prompt: string;
  /** Set when the agent goes on after a person answered its approval. */
  readonly resume?: ResumeAfterApproval;
}

/** The harnesses that start a program for the agent: every harness but Halonic's own loop. */
export type ProgramHarness = Exclude<NonNullable<Agent["harness"]>, "halonic">;

/**
 * Run a state's agent in the harness its file names, instead of a model
 * call. The effect runner opens the sandbox and the bridge, starts the
 * harness and writes the events it reports; the run waits on `callId` as it
 * waits on a model call.
 */
export interface RunHarnessEffect {
  readonly type: "run-harness";
  readonly callId: string;
  readonly state: string;
  readonly agent: string;
  readonly harness: ProgramHarness;
  readonly prompt: string;
}

/** Call a tool. A tool that changes things gets the key `<runId>:<callId>`. */
export interface CallToolEffect {
  readonly type: "call-tool";
  readonly callId: string;
  readonly idempotencyKey: string;
  readonly agent: string;
  readonly tool: string;
  readonly args: unknown;
}

/**
 * Start a child run for a `workflow` state, in the parent's hub, with the
 * parent's kept definitions and the parent's `kind`.
 */
export interface StartChildEffect {
  readonly type: "start-child";
  readonly childRunId: string;
  readonly state: string;
  readonly workflowId: string;
  readonly input: Record<string, unknown>;
  /** How deep the child is: 1 for a child of a top-level run. */
  readonly depth: number;
}

/**
 * Tell the parent run that this child run waits or has ended. The effect
 * runner reads how the child is when it carries this out, and gives the
 * parent a `child` input, so a late or repeated telling changes nothing.
 */
export interface TellParentEffect {
  readonly type: "tell-parent";
  readonly parentRunId: string;
  readonly childRunId: string;
}

/** Wake the run with a `timer` input at `at`. */
export interface SetTimerEffect {
  readonly type: "set-timer";
  readonly key: string;
  readonly at: string;
}

/** Work with side effects that `step` carries out through the ports after appending. */
export type Effect =
  | CallModelEffect
  | RunHarnessEffect
  | CallToolEffect
  | StartChildEffect
  | TellParentEffect
  | SetTimerEffect;

/**
 * An event `decide` wants appended. `step` adds `runId`, `seq` and `at` (the
 * input's time); it leaves `entry` out, because `entryOf` works it out the same.
 */
export type DecidedEvent = RunEventBody & Pick<RunEventBase, "branch" | "item">;

/** What `decide` returns: the events to append, then the effects to carry out. */
export interface Decision {
  readonly events: readonly DecidedEvent[];
  readonly effects: readonly Effect[];
}

/** The definitions a run started with. The hub's other files join with 1(c). */
export interface RunDefinitions {
  readonly workflow: Workflow;
  /**
   * The hub's agents by id, for what their files decide, such as the
   * harness. Runs kept before agents joined have none, and their agents
   * run in Halonic's own loop, as they did when they started.
   */
  readonly agents?: Readonly<Record<string, Agent>>;
  /**
   * The hub's workflows by id, for its `workflow` states: a child run starts
   * from these, never from the workspace's files as they are now. Runs kept
   * without them can't start a child run.
   */
  readonly workflows?: Readonly<Record<string, Workflow>>;
}

/** The pure decider: what a run does next, given its state and one input. */
export type Decide = (
  state: RunState | null,
  input: DecideInput,
  definitions: RunDefinitions,
) => Decision;
