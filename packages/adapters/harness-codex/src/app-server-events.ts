import { HarnessEventFilter } from "@halonicjs/adapter-harness-kit";
import type { HarnessEvent } from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";
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

/** How a tool call ended, as `tool.result` says it. */
type ToolOutcome = NonNullable<Extract<HarnessEvent, { type: "tool.result" }>["outcome"]>;

/**
 * Turns the notifications of `codex app-server` into Halonic run events
 * (requirement `harness-codex.app-server-events`). One reader reads one run,
 * in order.
 *
 * - A shell command, a file change, a call to an MCP tool and an image Codex
 *   looks at become `tool.called` when the item starts and `tool.result` when
 *   it completes, except a call to the bridge's MCP server, which the bridge
 *   records itself.
 * - `turn/completed` becomes the run's one final `agent.finished`, whose
 *   output is the last thing the agent said. A turn that failed or was
 *   interrupted ends the run with an error instead.
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
  readonly #agentId: string;
  readonly #threadId: string;
  /** Removes the bridge token from what the reader reports, and everything after the final event. */
  readonly #filter: HarnessEventFilter;
  /** The ids of the items reported as `tool.called`, until their `tool.result`. */
  readonly #openCalls = new Set<string>();
  /** The last thing the agent said: the run's output when the turn completes. */
  #answer = "";

  constructor(options: AppServerEventReaderOptions) {
    this.#agentId = options.agentId;
    this.#threadId = options.threadId;
    this.#filter = new HarnessEventFilter(options);
  }

  /** Whether the reader has read `turn/completed` and reported the final `agent.finished`. */
  get finished(): boolean {
    return this.#filter.finished;
  }

  /**
   * Reads the next notification Codex sent.
   *
   * @returns the events it stands for, often none; none holds the bridge token
   * @throws Error when the turn failed or was interrupted; the message never holds the bridge token
   */
  read(notification: AppServerNotification): HarnessEvent[] {
    const { method, params } = notification;
    if (this.#filter.finished || !isPlainObject(params)) return [];
    if (params["threadId"] !== this.#threadId) return [];
    switch (method) {
      case "item/started":
        return this.#filter.pass(this.#started(parseCodexItem(params["item"])));
      case "item/completed":
        return this.#filter.pass(this.#completed(parseCodexItem(params["item"])));
      case "turn/completed":
        return this.#filter.pass([this.#finish(params["turn"])]);
      default:
        return [];
    }
  }

  #started(item: CodexItem | undefined): HarnessEvent[] {
    const call = item === undefined ? undefined : toolCallOf(item);
    if (item === undefined || call === undefined || this.#openCalls.has(call.id)) return [];
    this.#openCalls.add(call.id);
    return [{ type: "tool.called", agent: this.#agentId, tool: call.tool, args: call.args }];
  }

  #completed(item: CodexItem | undefined): HarnessEvent[] {
    if (item === undefined) return [];
    if (item.type === "agentMessage") this.#answer = item.text;
    const call = toolCallOf(item);
    if (call === undefined) return [];
    // An item Codex reports only as completed is still a call, so it's reported as both.
    const called = this.#openCalls.has(call.id) ? [] : this.#started(item);
    this.#openCalls.delete(call.id);
    const { result, outcome } = resultOf(item);
    return [
      ...called,
      { type: "tool.result", agent: this.#agentId, tool: call.tool, result, outcome },
    ];
  }

  /** The final `agent.finished`, or the error the run ends with. */
  #finish(turn: unknown): HarnessEvent {
    const status = isPlainObject(turn) ? turn["status"] : undefined;
    if (status !== "completed") throw this.#filter.error(failureSentence(turn));
    return { type: "agent.finished", agent: this.#agentId, output: this.#answer };
  }
}

/** The tool call an item stands for, or `undefined` when it isn't one the harness reports. */
function toolCallOf(item: CodexItem): { id: string; tool: string; args: unknown } | undefined {
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
