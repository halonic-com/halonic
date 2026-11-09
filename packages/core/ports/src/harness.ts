import type { AgentResume, RunEventBody, RunEventType } from "@halonicjs/events";

/** Version of the {@link Harness} port. A breaking change bumps it and comes with an ADR. */
export const harnessVersion = 1;

/**
 * Whether a harness can run on this machine, as `detect()` finds it. Studio
 * turns it into the sentence next to the harness choice, so each case
 * carries what that sentence needs.
 *
 * @example
 * const found = await codex.detect();
 * if (found.status === "missing") show(`${codex.name} isn't installed`);
 * if (found.status === "unsupported") show(`${codex.name} ${found.version} isn't supported (needs ${found.supported})`);
 */
export type HarnessDetection =
  /** Installed in a version Halonic supports. */
  | { status: "ready"; version: string }
  /** The program isn't installed, or isn't where Halonic looks for it. */
  | { status: "missing" }
  /** Installed, but in a version Halonic doesn't support; `supported` says which ones it does, such as ">=1.0.0". */
  | { status: "unsupported"; version: string; supported: string }
  /** Found, but asking it for its version failed; `error` says how, in words a person can act on. */
  | { status: "failed"; error: string };

/** What a harness run is asked to do: one agent of one run, with the agent's own settings. */
export interface HarnessTask {
  /** The run this agent belongs to. Every event the harness reports is written to its log. */
  runId: string;
  hubId: string;
  /** The agent's id; the harness sets it as `agent` on the events it reports for this agent. */
  agentId: string;
  /** The agent's instructions from its file; empty when it has none. */
  instructions: string;
  /** What the agent is asked to do in this run: the task step's prompt, or the chat message. */
  prompt: string;
  /** The model the agent's file names; the harness's own default when absent. */
  model?: string;
}

/**
 * The Halonic bridge of one run: a loopback address in Halonic that serves
 * the model gateway and Halonic's tools over MCP. The harness points its
 * program at `url` and puts `token` where an API key would go.
 *
 * The token is a credential for this run only. A harness never writes it into
 * an event, a log line or an error message.
 */
export interface HarnessBridge {
  /** The bridge's address on loopback, such as "http://127.0.0.1:41817". */
  url: string;
  /** The run's random token. */
  token: string;
}

/** The body of the run log event with this `type`. */
type RunEventOf<Type extends RunEventType> = Extract<RunEventBody, { type: Type }>;

/**
 * What a harness reports, as run log events without the fields the engine
 * adds. A harness run is still a Halonic run: Runs, the receipt, budgets and
 * the inbox read these events as they read the built-in agent loop's, so a
 * harness has no event types of its own.
 *
 * The engine adds the run fields (`runId`, `seq`, `at`) and the workflow
 * `state` the agent runs in, then writes the event to the run's log.
 *
 * - `agent.started` and `agent.finished` with a `parent` report a subagent.
 *   The engine writes the task's own `agent.started` before it calls
 *   `start`; the stream ends with the task's own `agent.finished`, without a
 *   `parent`, whose `output` is the agent's result.
 * - `llm.request`, `llm.response` and `llm.fallback` report model calls, with
 *   their token use and cost.
 * - `knowledge.searched`, `tool.called` and `tool.result` report tool use.
 * - `approval.requested` asks a person for an OK; the harness waits until
 *   `send` brings the answer. The built-in loop sets `resume`, so the run can
 *   continue after a restart; a program can't be resumed, so a program
 *   harness leaves it out.
 *
 * `approval.resolved` isn't here: the engine writes it when a person answers,
 * and passes the answer on with `send`.
 *
 * Each model call and tool call is recorded once. A call that goes through
 * the Halonic bridge is recorded by the bridge, so a harness reports only the
 * calls its program makes elsewhere. The built-in loop calls the model port
 * and Halonic's tools directly, so it reports all of its own.
 */
export type HarnessEvent =
  | Omit<RunEventOf<"agent.started">, "state">
  | RunEventOf<"llm.request">
  | RunEventOf<"llm.response">
  | RunEventOf<"llm.fallback">
  | RunEventOf<"knowledge.searched">
  | RunEventOf<"tool.called">
  | RunEventOf<"tool.result">
  | (Omit<RunEventOf<"approval.requested">, "state" | "resume"> & { resume?: AgentResume })
  | Omit<RunEventOf<"agent.finished">, "state">;

/** What `send` passes to a running harness. */
export type HarnessInput =
  /** A person's answer to a question the agent asked, or the next message of a chat. */
  | { type: "answer"; text: string }
  /** A person's decision on the `approval.requested` event with this `callId`. */
  | { type: "approval"; callId: string; approved: boolean; comment?: string };
