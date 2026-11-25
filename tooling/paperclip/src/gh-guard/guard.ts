import { type CallContext, type GuardedCommand, type StatusCall, statusCall } from "./match.ts";

/**
 * The `gh` wrapper's decision (HAL-16401): run `gh` as it is, or answer a
 * status read on `halonic` with the tool call that replaces it. The Agent
 * tools plugin decides whether the guard is on and counts each status read
 * it sees; when the plugin can't be asked, `gh` runs as it is.
 */

/** What the plugin answers for one status read. */
export interface PluginAnswer {
  readonly redirect: boolean;
}

/** What the wrapper needs from its process, so tests can fake it. */
export interface GuardDeps {
  /** `gh`'s arguments, without `gh`. */
  readonly args: readonly string[];
  /** Set in every Paperclip agent run; without it the guard stays out of the way. */
  readonly agentId: string | undefined;
  readonly context: CallContext;
  /** Asks the plugin about one status read; undefined when it can't be asked or didn't answer. */
  readonly askPlugin: (command: GuardedCommand) => Promise<PluginAnswer | undefined>;
  /** Runs the real `gh` with `args` and resolves with its exit code. */
  readonly runGh: (args: readonly string[]) => Promise<number>;
  readonly writeError: (text: string) => void;
}

/** Runs one `gh` call through the guard; resolves with the exit code. */
export async function runGuard(deps: GuardDeps): Promise<number> {
  if (deps.agentId === undefined || deps.agentId === "") {
    return await deps.runGh(deps.args);
  }
  const call = statusCall(deps.args, deps.context);
  if (call === undefined) {
    return await deps.runGh(deps.args);
  }
  const answer = await deps.askPlugin(call.command);
  if (answer?.redirect !== true) {
    return await deps.runGh(deps.args);
  }
  deps.writeError(redirectMessage(call));
  return 1;
}

/**
 * The name an agent in Claude Code calls a tool by, and loads it by with ToolSearch.
 * `my_prs` moved to the workspace plugin (HAL-17968); `pr_status` is still Agent tools'.
 */
export function claudeToolName(tool: StatusCall["tool"]): string {
  const plugin = tool === "my_prs" ? "halonic-ws_company" : "halonic_agent-tools";
  return `mcp__paperclip-assigned__${plugin}_${tool}`;
}

/** The exact call that replaces the read. */
export function toolCall(call: StatusCall): string {
  if (call.tool === "my_prs") return "my_prs()";
  return `pr_status({"pr": ${call.pr ?? "<number>"}})`;
}

/** What the agent reads instead of `gh`'s answer. */
export function redirectMessage(call: StatusCall): string {
  const what =
    call.tool === "my_prs"
      ? "your open pull requests with ci-ok, mergeable and signed approvals, the ones that need you first"
      : "ci-ok on the head, mergeable, behind base, the merge queue, signed approvals and your next step";
  return [
    `gh-guard: \`gh ${call.command}\` on ${call.repo} is answered by the Agent tools (HAL-16401). Use:`,
    `  ${toolCall(call)}`,
    `It gives ${what}, in one call.`,
    ...(call.tool === "pr_status" && call.pr === undefined
      ? ["my_prs() lists your pull requests with their numbers."]
      : []),
    `In Claude Code, load it first: ToolSearch "select:${claudeToolName(call.tool)}".`,
    "gh still answers what no tool does: `gh pr view <n> --comments` or `--json body,files`,",
    "a run's jobs and steps: `gh run view <id> --json jobs` or `--job <job id>`,",
    "and a failure log: `gh run list -w ci.yml -b <branch> -L 1 --json databaseId`, then `gh run view <id> --log-failed`.",
    "",
  ].join("\n");
}
