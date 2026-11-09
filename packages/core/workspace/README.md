# @halonicjs/workspace

Loads one workspace through a `DefinitionSource`: every file is parsed with the kind its place
gives, and every problem comes back with its file, key path, line and column.

- **Layer:** core
- **Owner:** elena
- **Public API:** `@halonicjs/workspace`

## Example

Load a small workspace with one good and one bad agent. The code lives in
[`examples/load-a-workspace.ts`](examples/load-a-workspace.ts), where it is typechecked and run by
`src/example.test.ts`; keep this copy in step with it. The file imports `../src/index.ts`, because a
package may not import itself by name; outside this package, import `@halonicjs/workspace` as below.

```ts
import type { DefinitionSource } from "@halonicjs/ports";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";

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
```

## How it loads

- **The kinds drive it.** A file's kind, hub and id come from the `places` each kind in
  `@halonicjs/format` registers (`placeOf` gives them for one path). The loader has no list of kinds
  of its own, so a new kind with a place is loaded without a change here.
- **Issues** are format's `FileProblem` plus `file`, the workspace-relative path. A file with an
  error is left out of `files`; its warnings, and those of the files that parsed, are in `issues`.
- **Ignored files** are those no kind places, such as a README or a file in an older layout. The
  reserved `.halonic/` folders are skipped without being listed.
- **Not yet:** checks across files (an agent naming a provider that doesn't exist), model aliases
  and the definitions a run keeps. They come in the next steps of the HAL-186 plan.
