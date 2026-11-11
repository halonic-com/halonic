import type {
  AgentResume,
  CantTryStep,
  ProviderText,
  RunEventBase,
  RunEventBody,
  RunFailureReason,
  RunKind,
  RunParent,
  RunTrigger,
  RunVersion,
  ToolOutcome,
  ToolRisk,
} from "@halonicjs/events";
import type { Agent, Collection, Connector, KnowledgeSource, Workflow } from "@halonicjs/format";
import type { ResumeAfterStop, RunState } from "./run-state.ts";

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
  /** The harness every task agent of the run runs in, whatever its file names. */
  readonly harness?: string;
  /**
   * The steps of a Try it or Test run that can't be tried, as found when its
   * item was loaded. The run never runs them, and ends with `run.cant-try`
   * when it reaches one, or at once when one is the whole item.
   */
  readonly cantTry?: readonly CantTryStep[];
  /** Which version of the workspace the run read: the live version or the saved files. */
  readonly version?: RunVersion;
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

/**
 * What a connector call a `call-tool` effect made returned, and how it
 * ended: `unknown` when it broke off without an answer.
 */
export interface ToolResult {
  readonly type: "tool";
  readonly result: string;
  readonly outcome: ToolOutcome;
  /** The tool's risk as its listing gives it, for `tool.result`; absent when it gives none. */
  readonly risk?: ToolRisk;
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

/**
 * The agent stopped before a connector call that can change things. The
 * engine records `effect.requested` first, then makes the call itself with
 * a `call-tool` effect, and the agent goes on from `resume` with its result.
 */
export interface EffectNeeded {
  readonly type: "effect";
  /** The connector's id in the workspace. */
  readonly connector: string;
  /** The tool as the model named it. */
  readonly tool: string;
  readonly args: unknown;
  /** Where the agent stopped; the call to make is `resume.calls[0]`. */
  readonly resume: AgentResume;
}

/**
 * What a model call for a state's agent gives: its answer, or a stop for an
 * approval or for a connector call that can change things.
 */
export type ModelCallResult = ModelResult | ApprovalNeeded | EffectNeeded;

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
  /** Why the sandbox can't start, as the `Sandbox` port's code, for `sandbox-not-ready`. */
  readonly sandboxReason?: string;
  /** The model provider's own error text, for `--debug` and Copy details only. */
  readonly providerText?: ProviderText;
  /**
   * Set when the call's step couldn't be tried, because it needs a change
   * left out of the run: it ends its branch as a failure does, but the run
   * ends with `run.cant-try`, not `run.failed`, and `reason` isn't used.
   */
  readonly cantTry?: CantTryStep;
}

/**
 * A harness call asks a person for an OK, and goes on running while the run
 * waits: a harness's program can't stop and go on later, as the built-in
 * loop does. The run waits for `approve` or `reject`, then the call gets
 * the answer with an `answer-harness` effect.
 */
export interface HarnessAskedInput extends InputBase {
  readonly type: "harness-asked";
  /** The `callId` of the harness call that asks. */
  readonly callId: string;
  readonly tool: string;
  readonly args: unknown;
}

/** How a child run is now, as its parent hears it: waiting for events, or ended. */
export type ChildRunNow =
  | { readonly status: "waiting"; readonly events: readonly string[] }
  | { readonly status: "completed"; readonly context: Record<string, unknown> }
  | {
      readonly status: "failed";
      readonly error: string;
      /** Why the child failed, from its `run.failed`; absent when it gave none. */
      readonly reason?: RunFailureReason;
    }
  | {
      readonly status: "cant-try";
      /** Every step the child couldn't try, from its `run.cant-try`. */
      readonly cantTry: readonly CantTryStep[];
    };

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
  | HarnessAskedInput
  | ChildInput;

/** Ask a state's agent for its answer to a prompt. */
export interface CallModelEffect {
  readonly type: "call-model";
  readonly callId: string;
  readonly state: string;
  readonly agent: string;
  readonly prompt: string;
  /** Set when the agent goes on after a stop: a person's answer, or a connector call's result. */
  readonly resume?: ResumeAfterStop;
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

/**
 * Pass a person's answer to the harness call that asked for it, which is
 * still running. From here on the run waits on that call under `callId`,
 * the next call id, as it waits on the model call that goes on after an
 * approval of the built-in loop.
 */
export interface AnswerHarnessEffect {
  readonly type: "answer-harness";
  readonly callId: string;
  readonly state: string;
  readonly agent: string;
  readonly approved: boolean;
  /** What the person wrote with the answer, if anything. */
  readonly comment?: string;
}

/**
 * Make a connector call that can change things, as its `effect.requested`
 * asked, with the key `<runId>:<callId>`. A call that breaks off without
 * an answer, or takes longer than `timeoutMs`, gives the outcome `unknown`.
 */
export interface CallToolEffect {
  readonly type: "call-tool";
  readonly callId: string;
  readonly idempotencyKey: string;
  readonly state: string;
  readonly agent: string;
  readonly connector: string;
  /** The tool as the model named it. */
  readonly tool: string;
  readonly args: unknown;
  /** How long to wait for the connector's answer, as its `connector.started` says. */
  readonly timeoutMs: number;
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
  | AnswerHarnessEffect
  | CallToolEffect
  | StartChildEffect
  | TellParentEffect
  | SetTimerEffect;

/**
 * An event as the run log keeps it, before `step` adds `runId`, `seq` and
 * `at` (the input's time). It leaves `entry` out, because `entryOf` works it
 * out the same.
 */
export type LoggedEvent = RunEventBody & Pick<RunEventBase, "branch" | "item">;

/**
 * A file a state saves, such as an agent's answer for its `artifact`. `decide`
 * does no output, so it hands over the text; `step` keeps it in the blob
 * store before it appends, and logs `artifact.created` with the blob's hash,
 * size and media type in this place.
 */
export interface SaveArtifact {
  readonly type: "save-artifact";
  readonly state: string;
  readonly name: string;
  /** A `type/subtype` media type the blob store takes. */
  readonly mediaType: string;
  readonly text: string;
}

/** An event `decide` wants appended: one for the log as it is, or a file to save first. */
export type DecidedEvent = LoggedEvent | SaveArtifact;

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
  /**
   * The collections the hub can see by id, for the records tools of an
   * agent with `collections`: a run writes records with the fields it
   * started with. Runs kept without them give those agents no records tools.
   */
  readonly collections?: Readonly<Record<string, Collection>>;
  /**
   * The knowledge sources the hub can see by id, for agents with
   * `knowledge`. Runs kept without them give those agents no knowledge.
   */
  readonly knowledge?: Readonly<Record<string, KnowledgeSource>>;
  /**
   * The `tools` lists of the connector files the hub can see, by connector
   * id: a run's agent is offered only the tools a connector's `allow` keeps,
   * and nothing of a connector with no lists here. Runs kept without them
   * offer no connector's tools.
   */
  readonly connectorTools?: Readonly<Record<string, Connector["tools"]>>;
}

/** The pure decider: what a run does next, given its state and one input. */
export type Decide = (
  state: RunState | null,
  input: DecideInput,
  definitions: RunDefinitions,
) => Decision;
