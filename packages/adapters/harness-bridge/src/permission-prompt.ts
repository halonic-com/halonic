import type { BridgeApprovals } from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";
import { askForApproval, refusalReason } from "./approval.ts";
import type { McpTool, McpToolCallResult, McpToolSet } from "./mcp-tool-set.ts";

/** The one tool Claude Code's `--permission-prompt-tool` names on the bridge. */
export const approvePermissionTool = "approve_permission";

const approvePermission: McpTool = {
  name: approvePermissionTool,
  description:
    "Asks a person in Halonic whether one of Claude Code's own tool calls may run, and waits for the answer.",
  inputSchema: {
    type: "object",
    properties: {
      tool_name: {
        type: "string",
        description: "The tool Claude Code wants to call, such as Bash.",
      },
      input: { type: "object", description: "The call's arguments." },
      tool_use_id: { type: "string", description: "Claude Code's id for the call." },
    },
    required: ["tool_name", "input"],
  },
};

/**
 * What Claude Code reads from a permission prompt tool, as JSON text:
 * `allow` with the arguments to run the call with, or `deny` with the reason
 * the model reads.
 */
type PermissionAnswer =
  | { behavior: "allow"; updatedInput: Record<string, unknown> }
  | { behavior: "deny"; message: string };

/**
 * The `approve_permission` tool, which Claude Code calls through
 * `--permission-prompt-tool` before one of its own tool calls that its
 * settings don't already allow, such as `Bash` (requirement
 * `harness-bridge.approvals`). The bridge asks a person through the run's
 * approvals and answers Claude Code in its own format; the call runs
 * unchanged or not at all. Claude Code reports the call itself, so nothing
 * is recorded here.
 *
 * It is a tool set of its own, at its own path, so a program other than
 * Claude Code never finds it among Halonic's tools.
 */
export class PermissionPromptTool implements McpToolSet {
  readonly #approvals: BridgeApprovals;

  constructor(approvals: BridgeApprovals) {
    this.#approvals = approvals;
  }

  async list(): Promise<McpTool[]> {
    return [approvePermission];
  }

  async call(
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<McpToolCallResult> {
    if (name !== approvePermissionTool) {
      return { text: `There is no tool ${name} here.`, isError: true };
    }
    const tool = args["tool_name"];
    const input = args["input"];
    if (typeof tool !== "string" || !isPlainObject(input)) {
      return { text: "approve_permission needs a tool_name and an input object.", isError: true };
    }
    const answer = await askForApproval(this.#approvals, { tool, args: input }, signal);
    const permission: PermissionAnswer =
      answer.kind === "approved"
        ? { behavior: "allow", updatedInput: input }
        : { behavior: "deny", message: `Refused: ${refusalReason(answer)}` };
    return { text: JSON.stringify(permission), isError: false };
  }
}
