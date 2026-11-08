import type { AgentResume } from "./agent-resume.ts";
import type { RunKind, RunParent, RunTrigger, Usage } from "./run-basics.ts";

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
    }
  | { type: "state.entered"; state: string }
  /** `parent`: the agent that delegated this one (subagents); absent for the state's own agent. */
  | { type: "agent.started"; state: string; agent: string; prompt: string; parent?: string }
  | { type: "llm.request"; agent: string; provider: string; model: string; messages: number }
  | {
      type: "llm.response";
      agent: string;
      provider: string;
      model: string;
      usage: Usage;
      latencyMs: number;
      text: string;
      /** The model's summary of its reasoning, when it gives one. */
      thoughts?: string;
      /** In the budget currency, when the model has a price. */
      cost?: number;
      /** Answered from the cache (a simulation re-run), not by the model. */
      cached?: boolean;
    }
  | { type: "llm.fallback"; agent: string; from: string; to: string; error: string }
  | { type: "tool.called"; agent: string; tool: string; args: unknown }
  /** A knowledge source in "auto" mode was searched with the task before the first model call. */
  | { type: "knowledge.searched"; agent: string; source: string; query: string; refs: string[] }
  | { type: "tool.result"; agent: string; tool: string; result: string }
  /** A connector tool call that needs a person's OK; the run waits for "approve" or "reject". */
  | {
      type: "approval.requested";
      state: string;
      agent: string;
      tool: string;
      args: unknown;
      callId: string;
      resume: AgentResume;
    }
  | {
      type: "approval.resolved";
      state: string;
      agent: string;
      tool: string;
      callId: string;
      approved: boolean;
      comment?: string;
    }
  | { type: "agent.finished"; state: string; agent: string; output: unknown; parent?: string }
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
      status: "completed" | "failed";
      error?: string;
    }
  /** `child`: the run is waiting because this child run waits; events go to it. */
  | {
      type: "run.waiting";
      state: string;
      events: string[];
      child?: string;
      timers?: { after: string; at: string }[];
    }
  /** A timer transition (`after`) of a wait state fired. */
  | { type: "timer.fired"; state: string; after: string }
  | { type: "event.received"; event: string; payload?: unknown }
  | { type: "run.completed"; state: string; context: Record<string, unknown> }
  | { type: "run.failed"; state: string | null; error: string };

/**
 * One entry of a run log. Every run is an append-only stream of these; the
 * timeline, cost reports, test assertions and replays all read that one stream.
 */
export type RunEvent = RunEventBase & RunEventBody;

/** The name of an event, such as `"run.started"`. */
export type RunEventType = RunEvent["type"];
