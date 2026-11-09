import type { WorkspaceIssue } from "../load-workspace.ts";
import type { CheckContext } from "./check-context.ts";
import { findLoops } from "./loops.ts";

/**
 * Agents of one hub that delegate to each other in a loop, reported once
 * per loop on its first agent. The message is the old loader's.
 */
export function checkDelegationLoops(context: CheckContext): WorkspaceIssue[] {
  const hubs = new Set(context.filesOf("agent").map((agent) => agent.hub));
  const issues: WorkspaceIssue[] = [];
  for (const hub of hubs) {
    const agents = new Map(context.filesOf("agent", hub).map((agent) => [agent.value.id, agent]));
    const loops = findLoops([...agents.keys()], (id) => agents.get(id)?.value.subagents ?? []);
    for (const loop of loops) {
      const first = agents.get(loop[0] ?? "");
      if (first !== undefined) {
        const message = `Agents delegate in a loop: ${loop.join(" → ")}`;
        issues.push(context.error(first.path, ["subagents"], "delegation-loop", message));
      }
    }
  }
  return issues;
}
