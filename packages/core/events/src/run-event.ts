import type { AgentResume } from "./agent-resume.ts";
import type { ConnectorListingFailedEvent } from "./connector-listing-failed.ts";
import type {
  ApprovalResolver,
  CantTryStep,
  HarnessStartCause,
  LoggedInstructionPin,
  ModelSkipReason,
  ProviderText,
  RunFailureCause,
  RunFailureReason,
  RunKind,
  RunParent,
  RunTrigger,
  RunVersion,
  StoredBlob,
  ToolFailureCause,
  ToolNoun,
  ToolOutcome,
  ToolRefusalReason,
  ToolRisk,
  ToolUnaskedReason,
  ToolVerb,
  Usage,
} from "./run-basics.ts";
import type { LoggedSandboxBlock } from "./sandbox-blocked.ts";
import type { SandboxOpenedView } from "./sandbox-opened.ts";

// Every event name and field here is part of the run log, which users keep on
// disk and read with their own tools. Rename or remove nothing; new fields are
// optional and come with a requirement.

/** The fields every event in a run log has, whatever its type. */
export interface RunEventBase {
  runId: string;
  /** Position in the stream, starting at 1. */
  seq: number;
  /** ISO timestamp. */
  at: string;
  /** Set on events of one branch of a parallel state. */
  branch?: string;
  /** Set on events of one item of a for-each state (0-based). */
  item?: number;
  /**
   * The timeline entry this event belongs to: the `seq` of the event that
   * opened the entry. On an opening event it equals `seq`. Logs written
   * before this field existed don't have it; read them with `entryOf`.
   */
  entry?: number;
}

/** What one event says, by its `type`. A run log is a list of these, each with a {@link RunEventBase}. */
export type RunEventBody =
  | {
      type: "run.started";
      hubId: string;
      /** Workflow id, or "agent:<agentId>" for a run of a single agent. */
      workflowId: string;
      input: Record<string, unknown>;
      kind: RunKind;
      definitionsVersion: string;
      trigger?: RunTrigger;
      /** Set when a workflow state of another run started this one (a subflow). */
      parent?: RunParent;
      /**
       * The harness every task agent of the run runs in, whatever its file
       * names, such as `codex`; `halonic` runs them all in Halonic's own loop
       * (requirement `events.run-started-harness`). Absent when the run keeps
       * each agent's own harness, and in older logs.
       */
      harness?: string;
      /**
       * The steps of a Try it or Test run that can't be tried, as found when
       * the run's item was loaded, so a timeline can mark them straight away
       * (requirement `events.run-cant-try`). Absent when there are none, and
       * in older logs.
       */
      cantTry?: CantTryStep[];
      /**
       * Which version of the workspace the run read: the live version, with
       * its commit and date, or the saved files (requirement
       * `events.run-started-version`). A child run has its parent's. Absent
       * in logs written before it was recorded: read that as "not
       * recorded", never as the saved files.
       */
      version?: RunVersion;
    }
  | { type: "state.entered"; state: string }
  /** `parent`: the agent that delegated this one (subagents); absent for the state's own agent. */
  | { type: "agent.started"; state: string; agent: string; prompt: string; parent?: string }
  /** `alias`: the model alias the call went to, such as `fast`; absent in older logs and when the model has none (requirement `engine.llm-request-alias`). */
  | {
      type: "llm.request";
      agent: string;
      provider: string;
      model: string;
      alias?: string;
      messages: number;
    }
  | {
      type: "llm.response";
      agent: string;
      provider: string;
      model: string;
      usage: Usage;
      /**
       * From the request to the answer, including the time spent on any model
       * that failed before the call fell back to the one that answered.
       */
      latencyMs: number;
      text: string;
      /** The model's summary of its reasoning, when it gives one. */
      thoughts?: string;
      /**
       * In the budget currency, when the model has a price. On a call marked
       * with `paidBy`, `0` means Halonic paid nothing for it, not that the
       * model is free.
       */
      cost?: number;
      /**
       * Who paid for the call when it wasn't Halonic: `"subscription"` when
       * the person's own subscription did, through the harness bridge's
       * sign-in. Such a call has its tokens but no price, counts in the run's
       * `subscriptionCalls` and never towards `cost` or a budget (requirement
       * `events.summary-cost`). Absent otherwise.
       */
      paidBy?: "subscription";
      /** Answered from the cache (a simulation re-run), not by the model. */
      cached?: boolean;
      /**
       * The answer made no tool call, but its text is a call to a tool the
       * step offered, written out as JSON (requirement
       * `events.tool-call-as-text`). That call never runs. Absent otherwise.
       */
      toolCallAsText?: true;
      /**
       * The provider's plain sentences on how it changed the call, such as
       * a setting the model doesn't take (requirement
       * `events.provider-notes`). Kept on every call they came with; shown
       * once per run (`providerNotes`). Absent otherwise.
       */
      notes?: string[];
    }
  /**
   * The call moved on to the next model. `providerText`: the provider's own
   * error text, for `--debug` and Copy details only (requirement
   * `events.provider-text`); absent in older logs and when it gave none.
   */
  | {
      type: "llm.fallback";
      agent: string;
      from: string;
      to: string;
      error: string;
      providerText?: ProviderText;
    }
  /**
   * A model alias was skipped before any call (requirement
   * `events.llm-skipped`), such as "smart: no key, using default". `next` is
   * the alias tried instead; absent when none is left.
   */
  | {
      type: "llm.skipped";
      agent: string;
      alias: string;
      provider: string;
      model: string;
      reason: ModelSkipReason;
      next?: string;
    }
  /**
   * A request of the agent's program to the harness bridge failed for a reason
   * the bridge didn't name to the program, which was told the run log has the
   * details (requirement `events.bridge-failed`). `kind`: the error kind of
   * `@halonicjs/std`, such as `internal`. `message`: the error's own text,
   * never holding the run token. It never counts towards a budget.
   */
  | { type: "bridge.failed"; agent: string; kind: string; message: string }
  | { type: "tool.called"; agent: string; tool: string; args: unknown }
  /**
   * A model's tool call was refused before it ran, so it reached nothing
   * (requirement `events.tool-refused`). `tool`: the name exactly as the
   * model wrote it, which may hold look-alike or control characters.
   * `toolCallId`: the model's id for the call. A refused call has no
   * `tool.called` or `tool.result`.
   */
  | {
      type: "tool.refused";
      agent: string;
      tool: string;
      toolCallId: string;
      reason: ToolRefusalReason;
    }
  /**
   * A connector's tool call is about to run without asking a person,
   * because the `read` list of the connector's file names the tool
   * (requirement `events.tool-unasked`). `connector`: the connector's id.
   * `tool`: the name the model called. Written before the call, so it shows
   * even when the call fails.
   */
  | {
      type: "tool.unasked";
      agent: string;
      connector: string;
      tool: string;
      reason: ToolUnaskedReason;
    }
  /**
   * A step's sandbox is being opened (requirement `events.started-events`).
   * Written before the call, so a screen can say what the step waits for;
   * `timeoutMs` is how long the engine waits before the step fails.
   */
  | { type: "sandbox.started"; state: string; agent: string; timeoutMs: number }
  /**
   * A step's harness program is being started (requirement
   * `events.started-events`). `harness` is the agent's harness id, such as
   * `"claude-code"`; `timeoutMs` is how long the engine waits for its first event.
   */
  | { type: "harness.started"; state: string; agent: string; harness: string; timeoutMs: number }
  /**
   * The instructions a step's harness runs with, pinned by content hash
   * (requirement `events.harness-instructions`). Written right before
   * `harness.started`, so a review can tell which instructions a run had.
   * `files` lists `AGENTS.md` and each skill file, with paths relative to the
   * run's folder, never absolute ones; `sha256` is the hash of the whole set.
   * It never holds file contents. Logs written before this event have none.
   */
  | {
      type: "harness.instructions";
      state: string;
      agent: string;
      files: { path: string; sha256: string }[];
      sha256: string;
    }
  /**
   * A step's sandbox opened (requirement `events.sandbox-opened`). `sandbox`
   * is a display copy of its profile, never its environment variables.
   */
  | { type: "sandbox.opened"; state: string; agent: string; sandbox: SandboxOpenedView }
  /**
   * A step ran without the sandbox because a person chose to run the agent
   * on this computer (requirement `events.sandbox-off`). `chosenAt` is when
   * they made that choice, as an ISO 8601 date and time. Logs written before
   * this event have neither it nor `sandbox.opened`.
   */
  | { type: "sandbox.off"; state: string; agent: string; chosenAt: string }
  /**
   * A step's sandbox refused an access (requirement `events.sandbox-blocked`).
   * `count` is the running total of refused accesses to this target (or to
   * `others`) in the step so far: the engine logs a target's first block at
   * once and the total at the end of the step. A later event replaces an
   * earlier count, it doesn't add to it: events with 1 and then 7 for one
   * target mean 7 refused accesses.
   */
  | {
      type: "sandbox.blocked";
      state: string;
      agent: string;
      block: LoggedSandboxBlock;
      count: number;
    }
  /**
   * A step is about to call a connector's program (requirement `events.connector-started`).
   * `connector`: its id in the workspace. `timeoutMs`: how long the engine waits for it; every
   * wait has a limit. Logged before the call, so a screen can say what the step is waiting for.
   */
  | {
      type: "connector.started";
      state: string;
      agent: string;
      connector: string;
      timeoutMs: number;
    }
  | ConnectorListingFailedEvent
  /**
   * A step is about to make a connector call that can change things
   * (requirement `events.effect-requested`). Written before the call, so a
   * call with this record and no `tool.result` may or may not have done its
   * work. `callId`: the engine's id for the call, `call-<n>`, unique in the
   * run. `idempotencyKey`: `<runId>:<callId>`, the same when a person has
   * the call tried again. `resume`: where the agent goes on once the call
   * has a result.
   */
  | {
      type: "effect.requested";
      state: string;
      agent: string;
      connector: string;
      tool: string;
      args: unknown;
      callId: string;
      idempotencyKey: string;
      resume: AgentResume;
      /** The subagent whose call it is (requirement `events.agent-resume-inner`); absent for the state's own agent. */
      subagent?: string;
    }
  /** A knowledge source in "auto" mode was searched with the task before the first model call. */
  | { type: "knowledge.searched"; agent: string; source: string; query: string; refs: string[] }
  /**
   * `outcome`: how the call ended (requirement `events.tool-result-outcome`).
   * `risk`, `noun` and `verb`: what the tool can do, what one call sends,
   * reads or drafts and what it does to it, copied from its integration's
   * sheet when the call ends (requirement `events.tool-result-risk`). Each is absent in older
   * logs, and `risk`, `noun` and `verb` for a tool without a sheet. A
   * missing `verb` means "sent".
   * `resultBlob`: set when the result was too large for the log; `result`
   * then holds only its start, and the whole result is in the blob store
   * (requirement `events.tool-result-blob`).
   * `cause`: why the call failed, when the engine knows (requirement
   * `events.tool-result-cause`); read it with `toolFailureCauseOf`.
   */
  | {
      type: "tool.result";
      agent: string;
      tool: string;
      result: string;
      outcome?: ToolOutcome;
      risk?: ToolRisk;
      noun?: ToolNoun;
      verb?: ToolVerb;
      resultBlob?: StoredBlob;
      cause?: ToolFailureCause;
    }
  /** A connector tool call that needs a person's OK; the run waits for "approve" or "reject". */
  | {
      type: "approval.requested";
      state: string;
      agent: string;
      tool: string;
      args: unknown;
      callId: string;
      resume: AgentResume;
      /** The subagent whose call it is (requirement `events.agent-resume-inner`); absent for the state's own agent. */
      subagent?: string;
      /** The connector the tool comes from (requirement `events.approval-requested-connector`); absent in older logs. `tool` stays the bare name. */
      connector?: string;
    }
  | {
      type: "approval.resolved";
      state: string;
      agent: string;
      tool: string;
      callId: string;
      approved: boolean;
      comment?: string;
      /** Who resolved it (requirements `events.approval-resolved-by` and `events.approval-resolved-remote`); absent in older logs. */
      by?: ApprovalResolver;
    }
  /**
   * `error` and `reason`: set when the agent failed without failing the run,
   * as a parallel branch does; `output` is then `null` (requirement
   * `events.agent-finished-error`). Absent in older logs and for an agent
   * that answered.
   * `cantTry`: set instead of `reason` when the agent's step couldn't be
   * tried (requirement `events.run-cant-try`), as a parallel branch reports it.
   * `pin` and `changed`: with the reason `instructions-not-trusted` only, as `run.failed` gives them
   * (requirement `events.run-failed-instructions-not-trusted`); `agent` is the one that didn't start.
   */
  | {
      type: "agent.finished";
      state: string;
      agent: string;
      output: unknown;
      parent?: string;
      error?: string;
      reason?: RunFailureReason;
      pin?: LoggedInstructionPin;
      changed?: boolean;
      cantTry?: CantTryStep;
    }
  | {
      type: "artifact.created";
      state: string;
      name: string;
      hash: string;
      mediaType: string;
      size: number;
    }
  | { type: "context.updated"; key: string; value: unknown }
  /** A step sent a signal; routines with a signal trigger start on it. */
  | { type: "signal.sent"; state: string; name: string; data: Record<string, unknown> }
  | { type: "transition"; from: string; to: string; event: string }
  /** A workflow state started a child run; it finishes with workflow.finished. */
  | { type: "workflow.started"; state: string; workflow: string; childRunId: string }
  | {
      type: "workflow.finished";
      state: string;
      workflow: string;
      childRunId: string;
      /** `cant-try` when the child ended with `run.cant-try` (requirement `events.run-cant-try`). */
      status: "completed" | "failed" | "cant-try";
      error?: string;
      /**
       * The child's final context, set when it completed as one item of a
       * for-each state (requirement `events.workflow-finished-context`);
       * absent otherwise and in older logs.
       */
      context?: Record<string, unknown>;
    }
  /**
   * The child run a waiting `workflow` state waits on runs again, so the run
   * does too and takes no events until the child waits again
   * (requirement `events.workflow-resumed`).
   */
  | { type: "workflow.resumed"; state: string; childRunId: string }
  /**
   * `child`: the run is waiting because this child run waits; events go to it.
   * `title` and `body`: the wait step's description, filled in against the
   * run when it started waiting (requirement `events.waiting-description`).
   * The filled-in values can be model output: show them as plain text.
   * `labels`: event → the label the step's author gave that answer, for the
   * events that have one (requirement `events.answer-labels`).
   */
  | {
      type: "run.waiting";
      state: string;
      events: string[];
      child?: string;
      timers?: { after: string; at: string }[];
      title?: string;
      body?: string;
      labels?: Record<string, string>;
    }
  /** A timer transition (`after`) of a wait state fired. */
  | { type: "timer.fired"; state: string; after: string }
  | { type: "event.received"; event: string; payload?: unknown }
  | { type: "run.completed"; state: string; context: Record<string, unknown> }
  /**
   * `reason`: why the run failed (requirement `events.run-failed-reason`); absent in older logs.
   * `host`: with `model-unreachable` and `model-timeout` only, the host and port that didn't answer, such as
   * `localhost:11434` (requirement `events.run-failed-model-unreachable`).
   * `sandboxReason`: with `sandbox-not-ready`, and with `sandbox-start-failed` when the sandbox
   * check no longer passed once the sandbox failed to open, why the sandbox can't start, as the
   * `Sandbox` port's reason code, such as `bubblewrap-missing` (requirements
   * `events.run-failed-sandbox-not-ready` and `events.run-failed-sandbox-start-failed`).
   * A reader that doesn't know the code reads it as `other`.
   * `harnessCause`: with `harness-start-failed` only, why the program didn't start when the engine
   * knows, `not-installed` or `signed-out` (requirement `events.run-failed-harness-cause`).
   * `agent`: with `sandbox-not-ready`, the agent that didn't start (requirement `events.run-failed-sandbox-not-ready`).
   * `agent`, `pin` and `changed`: with `instructions-not-trusted`, the agent that didn't start,
   * the digests of the instructions the check saw (never their text) and whether a person had
   * trusted instructions for it before (requirement `events.run-failed-instructions-not-trusted`);
   * absent in older logs. A reader that doesn't know the reason still shows `error`.
   * `providerText`: the model provider's own error text, for `--debug` and Copy details only
   * (requirement `events.provider-text`); absent in older logs and when it gave none.
   * `cause`: the typed cause, from the error the failing call threw, when that error has a
   * kind (requirement `events.run-failed-cause`); absent in older logs. A screen reads it, never `error`.
   */
  | {
      type: "run.failed";
      state: string | null;
      error: string;
      reason?: RunFailureReason;
      host?: string;
      sandboxReason?: string;
      harnessCause?: HarnessStartCause;
      agent?: string;
      pin?: LoggedInstructionPin;
      changed?: boolean;
      providerText?: ProviderText;
      cause?: RunFailureCause;
    }
  /**
   * A Try it or Test run ended at a step it couldn't try, and nothing in it
   * really failed (requirement `events.run-cant-try`). `cantTry` lists every
   * such step: the ones found when the item was loaded and the ones found
   * while running. A run with a real failure ends with `run.failed` instead.
   */
  | { type: "run.cant-try"; state: string | null; cantTry: CantTryStep[] };

/**
 * One entry of a run log. Every run is an append-only stream of these; the
 * timeline, cost reports, test assertions and replays all read that one stream.
 */
export type RunEvent = RunEventBase & RunEventBody;

/** The name of an event, such as `"run.started"`. */
export type RunEventType = RunEvent["type"];
