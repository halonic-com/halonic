import type { McpTool, McpToolCallResult, McpToolSet } from "@halonicjs/adapter-mcp/server";
import { cappedAnswer } from "./answer-cap.ts";
import type { CodingTool } from "./coding-tool.ts";
import type { ToolFolders } from "./folders.ts";
import { ReadCache } from "./read/read-cache.ts";
import { readRangesTool } from "./read/read-ranges.ts";
import { repoMapTool } from "./repo-map.ts";
import { runTestsTool } from "./run-tests/run-tests.ts";
import { searchTool } from "./search/search.ts";
import { ToolRefusal } from "./tool-input.ts";

/**
 * Which tools the server offers. `read-only` leaves out `run_tests`: Codex
 * gets only the reading tools until it is confirmed to ask before using an
 * MCP tool (HAL-16748).
 */
export type CodingToolChoice = "all" | "read-only";

/** What the coding tools need. */
export interface CodingToolsOptions {
  readonly folders: ToolFolders;
  readonly choice: CodingToolChoice;
  /** The test command's whole environment, from `testEnvironment`. */
  readonly testEnvironment: Readonly<Record<string, string>>;
  /** Values removed from test output, from `secretValues`. */
  readonly secrets: readonly string[];
  /** The longest a test run may take, in seconds. */
  readonly maxTestSeconds?: number;
}

/**
 * The coding tools of one session as an MCP tool set (requirements
 * `coding-tools.tool-set` and `coding-tools.read-only-choice`):
 * `read_ranges`, `search`, `repo_map` and, unless the choice is
 * `read-only`, `run_tests`. A call the tool refuses is an error result the
 * model reads; a call to a tool not offered is one too. Every answer is
 * capped at 24,000 characters.
 */
export class CodingToolSet implements McpToolSet {
  readonly #tools: readonly CodingTool[];

  constructor(options: CodingToolsOptions) {
    const tools = [
      readRangesTool(options.folders, new ReadCache()),
      searchTool(options.folders),
      repoMapTool(options.folders),
      runTestsTool({
        folders: options.folders,
        environment: options.testEnvironment,
        secrets: options.secrets,
        ...(options.maxTestSeconds === undefined
          ? {}
          : { maxTimeoutSeconds: options.maxTestSeconds }),
      }),
    ];
    this.#tools = options.choice === "all" ? tools : tools.filter((tool) => tool.readOnly);
  }

  /** The names of the tools that only read: the ones a harness may allow without asking. */
  get readOnlyToolNames(): string[] {
    return this.#tools.filter((tool) => tool.readOnly).map((tool) => tool.definition.name);
  }

  async list(): Promise<McpTool[]> {
    return this.#tools.map((tool) => tool.definition);
  }

  async call(
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<McpToolCallResult> {
    const tool = this.#tools.find((offered) => offered.definition.name === name);
    if (tool === undefined) {
      const offered = this.#tools.map((each) => each.definition.name).join(", ");
      return { text: `There is no tool '${name}' here. The tools are: ${offered}.`, isError: true };
    }
    try {
      const text = await tool.run(args, signal);
      return { text: cappedAnswer(text, "narrow the call"), isError: false };
    } catch (error) {
      if (error instanceof ToolRefusal) return { text: error.message, isError: true };
      throw error;
    }
  }
}
