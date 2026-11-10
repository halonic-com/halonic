import type {
  BridgeApprovals,
  BridgeRecorder,
  BridgeToolResult,
  BridgeTools,
  ToolDefinition,
} from "@halonicjs/ports";
import { askForApproval, refusalReason } from "./approval.ts";
import type { McpTool, McpToolCallResult, McpToolSet } from "./mcp-tool-set.ts";

/** Halonic's tools for one agent, and where their calls are recorded and approved. */
export interface HalonicToolsOptions {
  /** The agent the recorded events name. */
  agent: string;
  tools: BridgeTools;
  recorder: BridgeRecorder;
  /** Where a call that needs a person's OK asks for it. */
  approvals: BridgeApprovals;
}

/**
 * Halonic's tools for one agent of one run, as the bridge serves them at
 * `/mcp` (requirement `harness-bridge.mcp`).
 *
 * Every call is checked by {@link BridgeTools.check} first, so the agent's
 * `allow` and `approve` lists, "allow sending" and the workspace's trust
 * apply as in the built-in loop. A call that needs a person's OK waits for
 * it through the run's approvals. A refused call, or one a person rejected
 * or that got no answer, doesn't run and isn't recorded; the program gets
 * the reason as the call's error result. A call that runs is recorded as
 * `tool.called` and `tool.result`.
 */
export class HalonicTools implements McpToolSet {
  readonly #options: HalonicToolsOptions;

  constructor(options: HalonicToolsOptions) {
    this.#options = options;
  }

  async list(): Promise<McpTool[]> {
    const tools = await this.#options.tools.list();
    return tools.map(mcpTool);
  }

  async call(
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<McpToolCallResult> {
    const check = await this.#options.tools.check(name, args);
    if (check.kind === "refused") {
      return { text: `Refused: ${check.reason}`, isError: true };
    }
    if (check.kind === "ask") {
      const answer = await askForApproval(this.#options.approvals, { tool: name, args }, signal);
      if (answer.kind !== "approved") {
        return { text: `Refused: ${refusalReason(answer)}`, isError: true };
      }
    }
    const { result, outcome } = await this.#runTool(name, args, signal);
    return { text: result, isError: outcome !== "ok" };
  }

  /** Runs a call the check let through, or a person approved, recording it before and after. */
  async #runTool(
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<BridgeToolResult> {
    const { agent, tools, recorder } = this.#options;
    await recorder.record({ type: "tool.called", agent, tool: name, args });
    const ended = await callOrBreakOff(tools, name, args, signal);
    await recorder.record({ type: "tool.result", agent, tool: name, ...ended });
    return ended;
  }
}

/**
 * How a call ended. A tool that fails answers with `outcome: "error"`, so a
 * call that throws instead broke off, for instance because the program went
 * away: whether it did its work is `unknown`.
 */
async function callOrBreakOff(
  tools: BridgeTools,
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<BridgeToolResult> {
  try {
    return await tools.call(name, args, { signal });
  } catch {
    return { result: `The tool ${name} broke off without an answer.`, outcome: "unknown" };
  }
}

/** A tool as `tools/list` names it. MCP needs an object schema, so one without a type gets it. */
function mcpTool(tool: ToolDefinition): McpTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: { type: "object", ...tool.parameters },
  };
}
