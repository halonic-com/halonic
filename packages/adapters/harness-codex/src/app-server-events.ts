import { HarnessEventFilter } from "@halonicjs/adapter-harness-kit";
import type { HarnessEvent } from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";
import type { CodexApprovalRequest } from "./approvals.ts";
import { type CodexItem, type ItemStatus, parseCodexItem } from "./codex-item.ts";

/**
 * The name Codex knows the bridge's MCP server by, in the `config.toml` the
 * harness writes. The bridge records the calls to its tools itself, so the
 * harness doesn't report them again.
 */
export const bridgeServerName = "halonic";

/** A notification `codex app-server` sent, such as `item/completed`. */
export interface AppServerNotification {
  method: string;
  params: unknown;
}

/** What the reader needs to know about the run. */
export interface AppServerEventReaderOptions {
  /** The task agent's id: the `agent` of its events. */
  agentId: string;
  /** The run's bridge token. No event or error contains it, even when Codex printed it. */
  bridgeToken: string;
  /** The Codex thread the agent runs in, from `thread/start`. Notifications about other threads are skipped. */
  threadId: string;
}

/**
 * The error a run ends with when the task agent's turn failed or was
 * interrupted. Its `events` come just before it: the `agent.finished` of
 * each subagent still working, so every `agent.started` has its end.
 */
export class TurnFailedError extends Error {
  readonly events: readonly HarnessEvent[];

  constructor(message: string, events: readonly HarnessEvent[]) {
    super(message);
    this.name = "TurnFailedError";
    this.events = events;
  }
}

/** A tool call the reader reported, as `tool.called` named it. */
interface ToolCall {
  id: string;
  tool: string;
  args: unknown;
}

/** How a tool call ended, as `tool.result` says it. */
type ToolOutcome = NonNullable<Extract<HarnessEvent, { type: "tool.result" }>["outcome"]>;

/**
 * The name of a subagent: Codex 0.166.0 gives its subagents no type, so they
 * are "subagent", "subagent-2" and so on, in the order they started.
 */
const subagentName = "subagent";

/** The output of a subagent still working when the task agent finished. */
const unfinishedSentence = "The task agent finished before this subagent did.";

/**
 * The Codex tools that give a subagent its next task. For a subagent that
 * has finished, the prompt is kept until its next turn starts.
 */
const nextTaskTools: ReadonlySet<string> = new Set(["sendInput", "followupTask"]);

/** An agent with a Codex thread of its own: the task agent or one of its subagents. */
interface AgentThread {
  /** The `agent` of its events. */
  name: string;
  /** The agent that started it; `undefined` for the task agent. */
  parent?: string;
  /** Whether it is working on a turn, which `agent.started` reported. */
  running: boolean;
  /** The last thing it said: its output when its turn completes. */
  answer: string;
  /** The task it was sent for its next turn. */
  nextPrompt: string;
}

/**
 * Turns the notifications of `codex app-server` into Halonic run events
 * (requirements `harness-codex.app-server-events` and
 * `harness-codex.subagents`). One reader reads one run, in order.
 *
 * - A shell command, a file change, a call to an MCP tool and an image Codex
 *   looks at become `tool.called` when the item starts and `tool.result` when
 *   it completes, except a call to the bridge's MCP server, which the bridge
 *   records itself.
 * - A subagent Codex spawns becomes `agent.started` with a `parent`, and
 *   each turn it completes `agent.finished` with the same `parent`. The tool
 *   calls in its thread are reported with the subagent as `agent`.
 * - The task thread's `turn/completed` becomes the run's one final
 *   `agent.finished`, whose output is the last thing the agent said. A turn
 *   that failed or was interrupted ends the run with a {@link TurnFailedError}
 *   instead. Either way, the subagents still working finish first.
 * - A request in which Codex asks for an OK becomes `approval.requested`
 *   (see {@link approvalRequested}).
 * - Model calls go through the bridge, so the reader reports none.
 * - Notifications and item types it doesn't know are skipped, so a newer
 *   Codex can add some.
 * - The bridge token is removed from every event and error.
 *
 * @example
 * const reader = new AppServerEventReader({ agentId: "writer", bridgeToken, threadId });
 * const client = new AppServerClient({ process, bridgeToken, onMessage: (message) => {
 *   if (message.kind === "notification") for (const event of reader.read(message)) queue.push(event);
 * } });
 */
export class AppServerEventReader {
  /** Removes the bridge token from what the reader reports, and everything after the final event. */
  readonly #filter: HarnessEventFilter;
  /** The task agent and its subagents, by their thread id. Other threads are skipped. */
  readonly #agents = new Map<string, AgentThread>();
  /** The items reported as `tool.called`, until their `tool.result`, by thread and item id. */
  readonly #openCalls = new Map<string, ToolCall>();
  /** How many subagents have started, so each gets a name of its own. */
  #subagentCount = 0;

  constructor(options: AppServerEventReaderOptions) {
    this.#filter = new HarnessEventFilter(options);
    this.#agents.set(options.threadId, {
      name: options.agentId,
      running: true,
      answer: "",
      nextPrompt: "",
    });
  }

  /** Whether the reader has read `turn/completed` and reported the final `agent.finished`. */
  get finished(): boolean {
    return this.#filter.finished;
  }

  /**
   * Reads the next notification Codex sent.
   *
   * @returns the events it stands for, often none; none holds the bridge token
   * @throws TurnFailedError when the task agent's turn failed or was interrupted; the message never holds the bridge token
   */
  read(notification: AppServerNotification): HarnessEvent[] {
    const { method, params } = notification;
    if (this.#filter.finished || !isPlainObject(params)) return [];
    const threadId = params["threadId"];
    const agent = typeof threadId === "string" ? this.#agents.get(threadId) : undefined;
    if (typeof threadId !== "string" || agent === undefined) return [];
    switch (method) {
      case "item/started":
        return this.#filter.pass(this.#started(threadId, agent, parseCodexItem(params["item"])));
      case "item/completed":
        return this.#filter.pass(this.#completed(threadId, agent, parseCodexItem(params["item"])));
      case "turn/started":
        return this.#filter.pass(this.#turnStarted(agent));
      case "turn/completed":
        return this.#filter.pass(this.#turnCompleted(agent, params["turn"]));
      default:
        return [];
    }
  }

  /**
   * The `approval.requested` for an OK Codex asks for, with the agent whose
   * thread asks. The tool and its arguments are those of the call's
   * `tool.called` when it has been reported, such as a file change's
   * changes, and the request's own otherwise.
   *
   * @returns the event, or none when the thread isn't the run's or the run has finished
   */
  approvalRequested(request: CodexApprovalRequest): HarnessEvent[] {
    const agent = this.#agents.get(request.threadId);
    if (this.#filter.finished || agent === undefined) return [];
    const call = this.#openCalls.get(`${request.threadId}/${request.itemId}`);
    return this.#filter.pass([
      {
        type: "approval.requested",
        agent: agent.name,
        tool: call?.tool ?? request.tool,
        args: call?.args ?? request.args,
        callId: request.callId,
      },
    ]);
  }

  #started(threadId: string, agent: AgentThread, item: CodexItem | undefined): HarnessEvent[] {
    if (item === undefined) return [];
    if (item.type === "collabAgentToolCall") {
      this.#keepNextTask(item);
      return [];
    }
    const call = toolCallOf(item);
    if (call === undefined || this.#openCalls.has(`${threadId}/${call.id}`)) return [];
    this.#openCalls.set(`${threadId}/${call.id}`, call);
    return [{ type: "tool.called", agent: agent.name, tool: call.tool, args: call.args }];
  }

  #completed(threadId: string, agent: AgentThread, item: CodexItem | undefined): HarnessEvent[] {
    if (item === undefined) return [];
    if (item.type === "agentMessage") agent.answer = item.text;
    if (item.type === "collabAgentToolCall") return this.#spawned(agent, item);
    const call = toolCallOf(item);
    if (call === undefined) return [];
    const key = `${threadId}/${call.id}`;
    // An item Codex reports only as completed is still a call, so it's reported as both.
    const called = this.#openCalls.has(key) ? [] : this.#started(threadId, agent, item);
    this.#openCalls.delete(key);
    const { result, outcome } = resultOf(item);
    return [
      ...called,
      { type: "tool.result", agent: agent.name, tool: call.tool, result, outcome },
    ];
  }

  /**
   * Keeps the task a `sendInput` or `followupTask` gives a subagent that has
   * finished, for its next turn. A subagent still working takes the task
   * into the turn it is on, so the task is not its next start's prompt.
   */
  #keepNextTask(item: Extract<CodexItem, { type: "collabAgentToolCall" }>): void {
    if (!nextTaskTools.has(item.tool)) return;
    for (const receiver of item.receiverThreadIds) {
      const subagent = this.#agents.get(receiver);
      if (subagent !== undefined && !subagent.running) subagent.nextPrompt = item.prompt;
    }
  }

  /**
   * The `agent.started` of the subagent a completed `spawnAgent` started.
   * Its thread's id is known only once the item completes.
   */
  #spawned(
    parent: AgentThread,
    item: Extract<CodexItem, { type: "collabAgentToolCall" }>,
  ): HarnessEvent[] {
    const threadId = item.receiverThreadIds[0];
    if (item.tool !== "spawnAgent" || threadId === undefined || this.#agents.has(threadId)) {
      return [];
    }
    this.#subagentCount += 1;
    const name =
      this.#subagentCount === 1 ? subagentName : `${subagentName}-${this.#subagentCount}`;
    this.#agents.set(threadId, {
      name,
      parent: parent.name,
      running: true,
      answer: "",
      nextPrompt: "",
    });
    return [{ type: "agent.started", agent: name, prompt: item.prompt, parent: parent.name }];
  }

  /** A subagent that finished a turn and starts another, after a `sendInput`, starts again. */
  #turnStarted(agent: AgentThread): HarnessEvent[] {
    if (agent.parent === undefined || agent.running) return [];
    agent.running = true;
    agent.answer = "";
    const prompt = agent.nextPrompt;
    agent.nextPrompt = "";
    return [{ type: "agent.started", agent: agent.name, prompt, parent: agent.parent }];
  }

  /**
   * The `agent.finished` of the turn. The task agent's is the run's final
   * event, or the error the run ends with; either way, the subagents still
   * working finish just before it. A subagent whose turn failed finishes with what
   * went wrong as its output, and the run goes on: the task agent hears of
   * it from Codex and decides what to do.
   */
  #turnCompleted(agent: AgentThread, turn: unknown): HarnessEvent[] {
    const status = isPlainObject(turn) ? turn["status"] : undefined;
    if (agent.parent === undefined) {
      if (status !== "completed") {
        const { message } = this.#filter.error(failureSentence(turn));
        throw new TurnFailedError(message, this.#filter.pass(this.#unfinishedSubagents()));
      }
      return [
        ...this.#unfinishedSubagents(),
        { type: "agent.finished", agent: agent.name, output: agent.answer },
      ];
    }
    if (!agent.running) return [];
    agent.running = false;
    const output = status === "completed" ? agent.answer : failureSentence(turn);
    return [{ type: "agent.finished", agent: agent.name, output, parent: agent.parent }];
  }

  /**
   * The `agent.finished` of each subagent still working when the task agent
   * finished, so every `agent.started` has its end. The newest finishes
   * first, so a subagent's subagent finishes before it.
   */
  #unfinishedSubagents(): HarnessEvent[] {
    const events: HarnessEvent[] = [];
    for (const agent of [...this.#agents.values()].reverse()) {
      if (agent.parent === undefined || !agent.running) continue;
      agent.running = false;
      events.push({
        type: "agent.finished",
        agent: agent.name,
        output: unfinishedSentence,
        parent: agent.parent,
      });
    }
    return events;
  }
}

/** The tool call an item stands for, or `undefined` when it isn't one the harness reports. */
function toolCallOf(item: CodexItem): ToolCall | undefined {
  switch (item.type) {
    case "commandExecution":
      return { id: item.id, tool: "shell", args: { command: item.command, cwd: item.cwd } };
    case "fileChange":
      return { id: item.id, tool: "apply_patch", args: { changes: item.changes } };
    case "mcpToolCall":
      if (item.server === bridgeServerName) return undefined;
      // The name Codex gives the model, as Claude Code names MCP tools too.
      return { id: item.id, tool: `mcp__${item.server}__${item.tool}`, args: item.args };
    case "imageView":
      return { id: item.id, tool: "view_image", args: { path: item.path } };
    default:
      return undefined;
  }
}

/** What a completed tool item returned, and how it ended. */
function resultOf(item: CodexItem): { result: string; outcome: ToolOutcome } {
  switch (item.type) {
    case "commandExecution":
      return { result: item.output, outcome: outcomeOf(item.status) };
    case "fileChange":
      return {
        result: item.changes.map(({ kind, path }) => `${kind} ${path}`).join("\n"),
        outcome: outcomeOf(item.status),
      };
    case "mcpToolCall":
      return { result: item.text, outcome: outcomeOf(item.status) };
    default:
      return { result: "", outcome: "ok" };
  }
}

function outcomeOf(status: ItemStatus): ToolOutcome {
  if (status === "completed") return "ok";
  return status === "inProgress" ? "unknown" : "error";
}

/** What a person reads when the turn didn't complete. */
function failureSentence(turn: unknown): string {
  const status = isPlainObject(turn) ? turn["status"] : undefined;
  if (status === "interrupted")
    return "Codex stopped before it finished: its turn was interrupted.";
  const error = isPlainObject(turn) && isPlainObject(turn["error"]) ? turn["error"] : {};
  // The provider's answer to a refused key can repeat part of the key, so
  // Codex's message isn't passed on then.
  if (httpStatusOf(error["codexErrorInfo"]) === 401 || error["codexErrorInfo"] === "unauthorized") {
    return "Codex couldn't call the model: the model provider refused the key or sign-in (401).";
  }
  const message = typeof error["message"] === "string" ? error["message"].trim() : "";
  return message === ""
    ? "Codex stopped with an error."
    : `Codex stopped with an error: ${message}`;
}

/**
 * The HTTP status in Codex's error details, such as
 * `{ "httpConnectionFailed": { "httpStatusCode": 401 } }`, or `undefined`.
 */
function httpStatusOf(info: unknown): number | undefined {
  if (!isPlainObject(info)) return undefined;
  for (const details of Object.values(info)) {
    if (isPlainObject(details) && typeof details["httpStatusCode"] === "number") {
      return details["httpStatusCode"];
    }
  }
  return undefined;
}
