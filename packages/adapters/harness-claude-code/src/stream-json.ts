import type { HarnessEvent } from "@halonicjs/ports";
import { SecretScrubber } from "@halonicjs/std";
import { isBridgeTool } from "./bridge-tools.ts";
import { findSignInMessage, findSignInProblem, SignInError } from "./sign-in.ts";
import { type ContentBlock, parseStreamJsonLine, type StreamJsonLine } from "./stream-json-line.ts";

/**
 * The tool Claude Code starts a subagent with: `Agent` in the versions
 * Halonic supports, `Task` in older ones.
 */
const subagentTools: ReadonlySet<string> = new Set(["Agent", "Task"]);

/** The subagent type Claude Code uses when a call names none. */
const defaultSubagentType = "general-purpose";

/** What the reader needs to know about the run. */
export interface StreamJsonReaderOptions {
  /** The task agent's id: the `agent` of its own events and the `parent` of its subagents. */
  agentId: string;
  /** The run's bridge token. No event or error contains it, even when Claude Code printed it. */
  bridgeToken: string;
}

/** A tool call the reader has reported and waits for the result of. */
interface OpenCall {
  /** The agent that made the call. */
  agent: string;
  tool: string;
}

/** A subagent the reader has reported as started and not yet finished. */
interface OpenSubagent {
  name: string;
  parent: string;
}

/**
 * Turns the lines of `claude --output-format stream-json` into Halonic run
 * events (requirement `harness-claude-code.stream-json`). One reader reads
 * one run, line by line, in order.
 *
 * - A subagent call becomes `agent.started` with a `parent`, and its result
 *   `agent.finished` with the same `parent`.
 * - Any other tool call becomes `tool.called` and `tool.result`, except a
 *   call through the bridge, which the bridge records itself.
 * - The `result` line becomes the run's one final `agent.finished`. After
 *   it, the reader reports nothing more.
 * - Model calls go through the bridge, so the reader reports none.
 * - Line types it doesn't know are skipped, so a newer Claude Code can add
 *   some.
 * - The bridge token is removed from every event and error. It is in
 *   Claude Code's environment, so a tool call such as `env` can print it.
 *
 * @example
 * const reader = new StreamJsonReader({ agentId: "writer", bridgeToken: bridge.token });
 * for (const line of lines) {
 *   for (const event of reader.read(line)) yield event;
 *   if (reader.finished) break;
 * }
 */
export class StreamJsonReader {
  readonly #agentId: string;
  /** Removes the bridge token from what the reader reports. */
  readonly #scrubber = new SecretScrubber();
  /** Tool calls by their id, until their result arrives. */
  readonly #openCalls = new Map<string, OpenCall>();
  /** Subagents by the id of the call that started them, until it returns. */
  readonly #openSubagents = new Map<string, OpenSubagent>();
  /** How many subagents of each type have started, so each gets a name of its own. */
  readonly #subagentCounts = new Map<string, number>();
  #finished = false;

  constructor(options: StreamJsonReaderOptions) {
    this.#agentId = options.agentId;
    this.#scrubber.remember(options.bridgeToken);
  }

  /** Whether the reader has read the `result` line and reported the final `agent.finished`. */
  get finished(): boolean {
    return this.#finished;
  }

  /**
   * Reads the next line Claude Code printed.
   *
   * @returns the events the line stands for, often none; none holds the bridge token
   * @throws SignInError when Claude Code couldn't call the model for want of a sign-in
   * @throws Error when the line isn't stream-json or the run ended with an error; the message never holds the bridge token
   */
  read(line: string): HarnessEvent[] {
    if (this.#finished || line.trim() === "") return [];
    const parsed = parseStreamJsonLine(line);
    if (parsed === undefined) throw this.#notStreamJson(line);
    return this.#eventsOf(parsed).map((event) => this.#withoutToken(event));
  }

  #eventsOf(line: StreamJsonLine): HarnessEvent[] {
    switch (line.type) {
      case "assistant":
      case "user": {
        const agent = this.#agentOf(line.parentToolUseId);
        return line.blocks.flatMap((block) => this.#eventsOfBlock(block, agent));
      }
      case "result":
        return [this.#finish(line)];
      case "other":
        return [];
    }
  }

  /** The agent whose message has this `parent_tool_use_id`. */
  #agentOf(parentToolUseId: string | null): string {
    if (parentToolUseId === null) return this.#agentId;
    return this.#openSubagents.get(parentToolUseId)?.name ?? this.#agentId;
  }

  #eventsOfBlock(block: ContentBlock, agent: string): HarnessEvent[] {
    if (block.type === "tool_use") return this.#called(block, agent);
    return this.#returned(block);
  }

  #called(call: Extract<ContentBlock, { type: "tool_use" }>, agent: string): HarnessEvent[] {
    if (subagentTools.has(call.name)) {
      const name = this.#subagentName(call.input);
      this.#openSubagents.set(call.id, { name, parent: agent });
      return [{ type: "agent.started", agent: name, prompt: promptOf(call.input), parent: agent }];
    }
    if (isBridgeTool(call.name)) return [];
    this.#openCalls.set(call.id, { agent, tool: call.name });
    return [{ type: "tool.called", agent, tool: call.name, args: call.input }];
  }

  #returned(result: Extract<ContentBlock, { type: "tool_result" }>): HarnessEvent[] {
    const subagent = this.#openSubagents.get(result.toolUseId);
    if (subagent !== undefined) {
      this.#openSubagents.delete(result.toolUseId);
      const { name, parent } = subagent;
      return [{ type: "agent.finished", agent: name, output: result.text, parent }];
    }
    const call = this.#openCalls.get(result.toolUseId);
    if (call === undefined) return [];
    this.#openCalls.delete(result.toolUseId);
    const outcome = result.isError ? "error" : "ok";
    return [{ type: "tool.result", ...call, result: result.text, outcome }];
  }

  /**
   * A name for a new subagent: its type, such as "Explore", with a number
   * from the second one of that type on ("Explore-2"), so two of them never
   * share a timeline entry.
   */
  #subagentName(input: unknown): string {
    const type = stringField(input, "subagent_type") || defaultSubagentType;
    const count = (this.#subagentCounts.get(type) ?? 0) + 1;
    this.#subagentCounts.set(type, count);
    return count === 1 ? type : `${type}-${count}`;
  }

  /** The final `agent.finished`, or the error the run ends with. */
  #finish(result: Extract<StreamJsonLine, { type: "result" }>): HarnessEvent {
    const failed = result.isError || result.subtype.startsWith("error");
    // A successful result is the agent's answer, which may begin "Not logged
    // in…" for reasons of its own, so only the whole sign-in message counts.
    const signInProblem = failed ? findSignInProblem(result.text) : findSignInMessage(result.text);
    if (signInProblem !== undefined) throw new SignInError(signInProblem);
    if (failed) throw new Error(this.#scrubber.scrub(failureSentence(result)));
    this.#finished = true;
    return { type: "agent.finished", agent: this.#agentId, output: result.text };
  }

  /**
   * The error for a line that isn't stream-json. It never quotes the line,
   * which may hold anything Claude Code printed, the bridge token included;
   * only a sign-in message is recognised.
   */
  #notStreamJson(line: string): Error {
    const signInProblem = findSignInProblem(line);
    if (signInProblem !== undefined) return new SignInError(signInProblem);
    return new Error(
      "Claude Code printed a line that isn't stream-json, so Halonic stopped the run.",
    );
  }

  /** The event with the bridge token removed from every string in it: prompts, args, results and output. */
  #withoutToken(event: HarnessEvent): HarnessEvent {
    // `scrubValue` changes only the text of strings and keeps the shape, so
    // the copy is still the same kind of event.
    return this.#scrubber.scrubValue(event) as HarnessEvent;
  }
}

/** What a person reads when a run ended with an error result. */
function failureSentence({ subtype, text }: { subtype: string; text: string }): string {
  switch (subtype) {
    case "error_max_turns":
      return "Claude Code stopped because it used all its turns before it finished.";
    case "error_max_budget_usd":
      return "Claude Code stopped because it reached its spending limit.";
    default:
      return text.trim() === ""
        ? "Claude Code stopped with an error."
        : `Claude Code stopped with an error: ${text.trim()}`;
  }
}

/** The prompt Claude Code gave a subagent. */
function promptOf(input: unknown): string {
  return stringField(input, "prompt");
}

/** The string field `name` of a tool call's input; empty when there is none. */
function stringField(input: unknown, name: string): string {
  if (typeof input !== "object" || input === null) return "";
  const value: unknown = Reflect.get(input, name);
  return typeof value === "string" ? value : "";
}
