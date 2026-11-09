# @halonicjs/format

The workspace file format: one folder per file kind with its schema, defaults, cross-checks and JSON Schema.

- **Layer:** core
- **Owner:** elena
- **Public API:** `@halonicjs/format`

## Example

Parse a good and a bad agent file, and drop empty values before saving. The code lives in
[`examples/parse-an-agent.ts`](examples/parse-an-agent.ts), where it is typechecked and run by
`src/example.test.ts`; keep this copy in step with it. The file imports `../src/index.ts`, because a
package may not import itself by name; outside this package, import `@halonicjs/format` as below.

```ts
import { compact, parseFile } from "@halonicjs/format";

/** Parses a good and a bad agent file, and drops empty values before saving. */
export function runExample(): {
  name: string | undefined;
  warnings: number;
  problems: string[];
  saved: unknown;
} {
  // The id is the file name without its suffix: agents/clerk.agent.yaml.
  const good = parseFile("agent", "name: Clerk\n", { id: "clerk" });
  const name = good.ok ? good.value.value.name : undefined; // "Clerk"
  const warnings = good.ok ? good.value.warnings.length : 0; // 0

  // A bad file gives every problem, each with a path, a line and a column.
  const bad = parseFile("agent", "name: Clerk\noutput:\n  type: xml\n", { id: "clerk" });
  const problems = bad.ok
    ? []
    : bad.error.map(
        (problem) => `${problem.source} ${problem.code} at ${problem.line}:${problem.col}`,
      );

  // compact drops empty values before a file is written, as the old app did.
  const saved = compact({ name: "Clerk", tools: [], notes: undefined, output: { type: "text" } }); // { name: "Clerk", output: { type: "text" } }
  return { name, warnings, problems, saved };
}
```

A problem is `{ severity, source, code, path, message, line, col }`. `warnings` are problems that
don't make the file fail.

## Kinds

| Kind           | File                                                                    |
| -------------- | ----------------------------------------------------------------------- |
| `workspace`    | `workspace.yaml`                                                        |
| `deployments`  | `deployments.yaml`                                                      |
| `models`       | `models.yaml`                                                           |
| `provider`     | `providers/<id>.yaml`                                                   |
| `runtime`      | `runtimes/<id>.yaml`                                                    |
| `knowledge`    | `library/knowledge/<id>.yaml`                                           |
| `collection`   | `library/collections/<id>.collection.yaml`                              |
| `connector`    | `library/connectors/<id>.connector.yaml`                                |
| `skill`        | `library/skills/<id>/SKILL.md` (front matter)                           |
| `hub`          | `hubs/<hub>/hub.yaml`                                                   |
| `agent`        | `agents/<id>.agent.yaml`                                                |
| `workflow`     | `workflows/<id>.workflow.yaml`                                          |
| `workflowTest` | `workflows/<id>.test.yaml`                                              |
| `routine`      | `workflows/routines/<id>.routine.yaml`                                  |
| `integration`  | `integration.yaml`, next to the integration's code (not in a workspace) |

Most kinds can also sit inside a hub folder; `fileKinds[kind].places` has the
exact places. Each kind's folder in `src/kinds/` holds its schema, its tests and
a golden JSON Schema. Checks between files belong to the loader, not here.
