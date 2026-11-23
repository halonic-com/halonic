import type { McpTool } from "@halonicjs/adapter-mcp/server";
import type { ToolArguments } from "./tool-input.ts";

/** One of the coding tools: how MCP lists it, and what a call does. */
export interface CodingTool {
  /** Its name, description and argument schema, as `tools/list` gives them. */
  readonly definition: McpTool;
  /**
   * `true` for a tool that only reads in the working folder. Only these may
   * be allowed without asking, like Claude Code's own `Read`, and only these
   * are offered when the server serves the read-only tools (HAL-16748).
   */
  readonly readOnly: boolean;
  /**
   * Answers one call with the text the model reads.
   *
   * @throws {ToolRefusal} for a call it refuses, with the answer the model reads as an error
   */
  run(args: ToolArguments, signal: AbortSignal): Promise<string>;
}

/** The writing of answers that fill up: lines are added until the next one wouldn't fit. */
export class AnswerBudget {
  readonly #lines: string[] = [];
  #remaining: number;
  #full = false;

  /** @param characters - the most characters the lines may take, line breaks counted */
  constructor(characters: number) {
    this.#remaining = characters;
  }

  /** Whether a line has already been turned away. */
  get full(): boolean {
    return this.#full;
  }

  /** Adds the line when it fits; once one doesn't, nothing more is added. */
  add(line: string): boolean {
    if (this.#full || line.length + 1 > this.#remaining) {
      this.#full = true;
      return false;
    }
    this.#lines.push(line);
    this.#remaining -= line.length + 1;
    return true;
  }

  /** The lines added, joined. */
  text(): string {
    return this.#lines.join("\n");
  }
}
