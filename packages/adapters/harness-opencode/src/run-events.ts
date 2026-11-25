import type { HarnessEvent } from "@halonicjs/ports";
import { isPlainObject, SecretScrubber } from "@halonicjs/std";
import { bridgeServerName } from "./config.ts";

/**
 * The tools OpenCode 2.3.0 sends the model with Halonic's config and no MCP
 * server, in the order it sends them (requirement
 * `harness-opencode.tool-list`). The deny rules take every other tool of its
 * own out of the list. `skill` stays listed but finds no skill and is denied;
 * `opencode_worktree_remove` stays listed and its deny rule isn't enforced,
 * which the threat model records. A version that sends any other list fails
 * the contract test, so a new or ungated tool never reaches a model unseen.
 */
export const modelTools: readonly string[] = [
  "edit",
  "glob",
  "grep",
  "opencode_list_mcp_resources",
  "opencode_models",
  "opencode_read_mcp_resource",
  "opencode_session_move",
  "opencode_session_rename",
  "opencode_worktree_create",
  "opencode_worktree_list",
  "opencode_worktree_remove",
  "read",
  "shell",
  "skill",
  "write",
];

/** OpenCode names a tool of an MCP server `<server>_<tool>`. */
const bridgeToolPrefix = `${bridgeServerName}_`;

/** What the reader needs to know about the run. */
export interface OpenCodeEventReaderOptions {
  /** The task agent's id: the `agent` of every event. */
  agentId: string;
  /** The run's bridge token. No event or error contains it, even when OpenCode printed it. */
  bridgeToken: string;
}

/** One line of `opencode run --format json`, as far as the reader uses it. */
type OpenCodeLine =
  | { type: "step_start" }
  | { type: "text"; text: string }
  | { type: "tool_use"; tool: string; input: unknown; status: string; output: string }
  | { type: "step_finish"; reason: string }
  | { type: "error"; message: string }
  | { type: "other" };

/**
 * Turns the lines of `opencode run --format json` into Halonic run events
 * (requirement `harness-opencode.run-events`). One reader reads one run,
 * line by line, in order.
 *
 * - A `tool_use` line comes once a call has ended, so it becomes
 *   `tool.called` and `tool.result` together. A call to the bridge's MCP
 *   server is left out: the bridge records it.
 * - Model calls go through the bridge, which records their tokens and cost,
 *   so `step_start` and `step_finish` report nothing.
 * - OpenCode prints no line of its own when a run ends well, it exits.
 *   {@link finish} then gives the final `agent.finished`, whose output is
 *   the text of the last step.
 * - An `error` line ends the run with an error.
 * - Line types it doesn't know are skipped, so a newer OpenCode can add some.
 * - The bridge token is removed from every event and error. It is in
 *   OpenCode's environment, so a shell call such as `env` can print it.
 *
 * @example
 * const reader = new OpenCodeEventReader({ agentId: "writer", bridgeToken: bridge.token });
 * for (const line of lines) yield* reader.read(line);
 * if (exitedWell) yield* reader.finish();
 */
export class OpenCodeEventReader {
  readonly #agentId: string;
  /** Removes the bridge token from every event and error. */
  readonly #scrubber = new SecretScrubber();
  #finished = false;
  /** The text of the step being read, which becomes the output if it is the last. */
  #stepText: string[] = [];
  /** The text of the last step that finished. */
  #lastStepText = "";
  #stepsFinished = 0;

  constructor(options: OpenCodeEventReaderOptions) {
    this.#agentId = options.agentId;
    this.#scrubber.remember(options.bridgeToken);
  }

  /** Whether {@link finish} has given the final `agent.finished`. */
  get finished(): boolean {
    return this.#finished;
  }

  /**
   * Reads the next line OpenCode printed.
   *
   * @returns the events the line stands for, often none; none holds the bridge token
   * @throws Error when the line isn't OpenCode's JSON or is an `error` line; the message never holds the bridge token
   */
  read(line: string): HarnessEvent[] {
    if (this.#finished || line.trim() === "") return [];
    const parsed = parseLine(line);
    if (parsed === undefined) {
      // Never quote the line: it may hold anything OpenCode printed.
      throw new Error("OpenCode printed a line that isn't JSON, so Halonic stopped the run.");
    }
    return this.#withoutToken(this.#eventsOf(parsed));
  }

  /**
   * The final `agent.finished`, once OpenCode has exited well.
   *
   * @throws Error when no step finished, so the agent gave no answer
   */
  finish(): HarnessEvent[] {
    if (this.#finished) return [];
    if (this.#stepsFinished === 0) {
      throw new Error("OpenCode exited before the model answered.");
    }
    const output = this.#lastStepText;
    this.#finished = true;
    return this.#withoutToken([{ type: "agent.finished", agent: this.#agentId, output }]);
  }

  #withoutToken(events: HarnessEvent[]): HarnessEvent[] {
    // `scrubValue` changes only the text of strings and keeps the shape.
    return events.map((event) => this.#scrubber.scrubValue(event) as HarnessEvent);
  }

  #eventsOf(line: OpenCodeLine): HarnessEvent[] {
    switch (line.type) {
      case "step_start":
        this.#stepText = [];
        return [];
      case "text":
        this.#stepText.push(line.text);
        return [];
      case "tool_use":
        return this.#toolUsed(line);
      case "step_finish":
        this.#stepsFinished += 1;
        this.#lastStepText = this.#stepText.join("\n\n");
        return [];
      case "error":
        throw new Error(this.#scrubber.scrub(`OpenCode stopped with an error: ${line.message}`));
      case "other":
        return [];
    }
  }

  #toolUsed(call: Extract<OpenCodeLine, { type: "tool_use" }>): HarnessEvent[] {
    if (call.tool.startsWith(bridgeToolPrefix)) return [];
    const agent = this.#agentId;
    const outcome = call.status === "completed" ? "ok" : "error";
    return [
      { type: "tool.called", agent, tool: call.tool, args: call.input },
      { type: "tool.result", agent, tool: call.tool, result: call.output, outcome },
    ];
  }
}

/** The line as the reader uses it, or `undefined` when it isn't a JSON object with a `type`. */
function parseLine(line: string): OpenCodeLine | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!isPlainObject(value) || typeof value["type"] !== "string") return undefined;
  const part = isPlainObject(value["part"]) ? value["part"] : {};
  switch (value["type"]) {
    case "step_start":
      return { type: "step_start" };
    case "text":
      return { type: "text", text: stringOf(part["text"]) };
    case "tool_use":
      return toolUseOf(part);
    case "step_finish":
      return { type: "step_finish", reason: stringOf(part["reason"]) };
    case "error":
      return { type: "error", message: errorMessageOf(value["error"]) };
    default:
      return { type: "other" };
  }
}

/** A `tool_use` line's call: its tool, input, how it ended, and its output or error. */
function toolUseOf(part: Record<string, unknown>): OpenCodeLine {
  const state = isPlainObject(part["state"]) ? part["state"] : {};
  const status = stringOf(state["status"]);
  const output = status === "completed" ? state["output"] : state["error"];
  return {
    type: "tool_use",
    tool: stringOf(part["tool"]),
    input: state["input"] ?? {},
    status,
    output: stringOf(output),
  };
}

/** The message of an `error` line's `error`, or a plain sentence when it has none. */
function errorMessageOf(error: unknown): string {
  const message = isPlainObject(error) ? stringOf(error["message"]) : "";
  return message.trim() === "" ? "it didn't say why." : message.trim();
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}
