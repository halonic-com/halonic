import type { DefinitionSource } from "@halonicjs/ports";
import { filesOf, loadWorkspace } from "../src/index.ts";

/** Loads a small workspace with one good and one bad agent. */
export async function runExample(): Promise<{
  agents: string[];
  issues: string[];
  ignored: readonly string[];
}> {
  // Any DefinitionSource will do: a folder, git or, here, a few files in memory.
  const files = new Map([
    ["hubs/billing/hub.yaml", "name: Billing\n"],
    ["hubs/billing/agents/clerk.agent.yaml", "name: Clerk\n"],
    ["hubs/billing/agents/checker.agent.yaml", "name: Checker\noutput:\n  type: xml\n"],
    ["README.md", "# Acme\n"],
  ]);
  const source: DefinitionSource = {
    location: "memory:acme",
    list: async () => [...files.keys()].sort(),
    read: async (path) => files.get(path) ?? null,
    version: async () => "v1",
  };

  const workspace = await loadWorkspace(source);
  // Each file's kind and id come from where it sits.
  const agents = filesOf(workspace, "agent").map((agent) => `${agent.hub}/${agent.value.id}`); // ["billing/clerk"]
  // Every issue names its file, key path and line; the bad agent is left out of the files.
  const issues = workspace.issues.map(
    (issue) => `${issue.file}:${issue.line} ${issue.path.join(".")} ${issue.code}`,
  ); // ["hubs/billing/agents/checker.agent.yaml:3 output.type invalid_union"]
  return { agents, issues, ignored: workspace.ignored }; // ignored: ["README.md"]
}
