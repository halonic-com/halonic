# @halonicjs/format

The workspace file format: one folder per file kind with its schema, defaults, cross-checks and JSON Schema.

- **Layer:** core
- **Owner:** elena
- **Public API:** `@halonicjs/format`

## Example

```ts
import { parseFile } from "@halonicjs/format";

// The id is the file name without its suffix: agents/clerk.agent.yaml.
const parsed = parseFile("agent", text, { id: "clerk" });
if (!parsed.ok) {
  // every problem, each with { severity, source, code, path, message, line, col }
  for (const problem of parsed.error) report(problem);
  return;
}
parsed.value.value; // the agent, with the old app's defaults filled in
parsed.value.warnings; // problems that don't make the file fail
```

`compact(value)` drops empty values before a file is written, as the old app did.

## Kinds

| Kind           | File                                          |
| -------------- | --------------------------------------------- |
| `workspace`    | `workspace.yaml`                              |
| `deployments`  | `deployments.yaml`                            |
| `models`       | `models.yaml`                                 |
| `provider`     | `providers/<id>.yaml`                         |
| `runtime`      | `runtimes/<id>.yaml`                          |
| `knowledge`    | `library/knowledge/<id>.yaml`                 |
| `collection`   | `library/collections/<id>.collection.yaml`    |
| `connector`    | `library/connectors/<id>.connector.yaml`      |
| `skill`        | `library/skills/<id>/SKILL.md` (front matter) |
| `hub`          | `hubs/<hub>/hub.yaml`                         |
| `agent`        | `agents/<id>.agent.yaml`                      |
| `workflow`     | `workflows/<id>.workflow.yaml`                |
| `workflowTest` | `workflows/<id>.test.yaml`                    |
| `routine`      | `workflows/routines/<id>.routine.yaml`        |

Most kinds can also sit inside a hub folder; `fileKinds[kind].places` has the
exact places. Each kind's folder in `src/kinds/` holds its schema, its tests and
a golden JSON Schema. Checks between files belong to the loader, not here.
