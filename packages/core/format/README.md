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

| Kind | File |
| --- | --- |
| `workspace` | `workspace.yaml` |
| `deployments` | `deployments.yaml` |
| `models` | `models.yaml` |
| `provider` | `providers/<id>.yaml` |
| `runtime` | `runtimes/<id>.yaml` |
| `knowledge` | `library/knowledge/<id>.yaml` |
| `collection` | `library/collections/<id>.collection.yaml` |
| `connector` | `library/connectors/<id>.connector.yaml` |
| `skill` | `library/skills/<id>/SKILL.md` (front matter) |
| `hub` | `hubs/<hub>/hub.yaml` |
| `agent` | `agents/<id>.agent.yaml` |
| `workflow` | `workflows/<id>.workflow.yaml` |
| `workflowTest` | `workflows/<id>.test.yaml` |
| `routine` | `workflows/routines/<id>.routine.yaml` |
| `integration` | `integration.yaml`, next to the integration's code (not in a workspace) |
| `plugin` | `plugin.yaml`, at the root of a plugin folder (not in a workspace) |

Most kinds can also sit inside a hub folder; `fileKinds[kind].places` has the
exact places (`integration` and `plugin` have none: they live outside workspaces).
`kindNames()` lists the kinds and `isKindName(text)` tells whether a text names one. Each kind's
folder in `src/kinds/` holds its schema and its tests. Checks between files belong to the loader,
not here.

## Other exports

- `jsonSchemaOf(kind)` gives a kind's JSON Schema (see Spec files below).
- `SCHEMA_VERSION` is the file format version, written as `version` in files.
- `RESERVED_FOLDER` (`.halonic`) and `isReservedPath(path)`: Halonic's own data folder at the
  workspace root and in each hub, which the loader skips (requirement `reserved-folder`).
- `connectorIsLocal(connector)` says whether a connector counts as local for `privacy.localOnly`;
  `needsApproval(tools, name)` and `approveAll` (`"all"`) read a connector's `tools.approve` setting.
- `pathsNamedBy(start)` (with the types `ProgramStart` and `NamedPath`) lists the paths a program
  start names besides its folder: the program, each argument and `env` value read in pieces (also
  the text inside quotes, and a piece without its quotes or short flag), and the folder of a
  `python -m` module, with `-m` alone or among other short flags such as `-Im`.
  Every guard below reads a start through it, so they all find the same paths (requirement `program-start-paths`).
- `touchesSkillScripts(start, paths)` and `skillScriptsRefusal` let every adapter that starts a
  program refuse files under a skill's `scripts/` folder.
- `touchesWorkingFolder(start, workspaceRoot, workingFolders, lookup)` and `workingFolderRefusal`
  let every adapter that starts a connector's program refuse one that would run or load a file
  from a harness agent's working folder, on real paths (requirement `working-folder-start`).
- Integration sheets: `IntegrationSheet` is the schema; `parseIntegrationSheet(value)` checks a
  sheet that is already data (such as JSON), `checkIntegrationSheet(sheet)` runs the cross-field
  checks, and `integrationPolicy(sheet, settings)` turns a sheet and the integration's settings
  into the policy the integration kit enforces. The pattern and limit constants
  (`HOST_PATTERN`, `MAX_TIMEOUT_MS` and the like) are exported with them.
- Plugins: `Plugin`, `checkPlugin`, `backendSheet` and `pluginFromIntegrationSheet` read and check
  a `plugin.yaml` and convert a plugin's backend to and from an integration sheet.
  A plugin's id is at most 48 characters and a secret it declares at most 64, so the name the app
  keeps the secret under fits the `Secrets` port's 128.
- The types of each kind's value (`Agent`, `Workflow`, `Routine` and so on) and `Guard`.

## Subpath exports

Both entry points import only schema-kit and std, never `yaml`, so a reader that doesn't parse
workspace files doesn't load the YAML parser. `@halonicjs/format` doesn't re-export `./recording`.

- `@halonicjs/format/integration` is the integration permission sheet: `IntegrationSheet`,
  `parseIntegrationSheet`, `checkIntegrationSheet`, `integrationPolicy`, the pattern and limit
  constants, and the plugin helpers `Plugin`, `backendSheet` and `pluginFromIntegrationSheet`. The
  integration kit and the conformance suite read sheets through it
  (requirement `integration-entry`).
- `@halonicjs/format/recording` is the recording file, `integrations/<name>/recordings/<scenario>.json`,
  shared by the recorder and the conformance suite: `recordingFileSchema` (with the type
  `RecordingFile`), `formatRecording` and `RECORDING_FORMAT` (`halonic.recording/1`).

## Spec files

`spec/<kind>.schema.json` (for example `spec/workflow-test.schema.json`) is each kind's JSON
Schema (2020-12), as `jsonSchemaOf` emits it. These files are the source of truth for anyone
outside this repo who reads or writes workspace files. Each one's `$id`, for example
`https://halonic.com/spec/format/workflow/v1.schema.json`, names the file format version it
describes; nothing is hosted at that address yet.
`src/json-schema.test.ts` fails when the code and a spec file disagree. To update the files on
purpose after a schema change, run the tests with `SPEC_WRITE=1`, then review the diff.

When a release changes a spec file, `pnpm version:sync` keeps a frozen copy in
`spec/released/<version>/`, named after the app version because this package has none of its own.
A released copy never changes.

## Workflow tests

Each case of a `workflowTest` file scripts what a run would meet, because tests never contact a
model, a connector or a program: `mocks` (model replies per agent id), `tools` (connector results,
keyed `<connector>.<tool>`) and `programs`. `programs` maps an agent id to a list of results for the
programs its harness starts, used in the order the engine starts them (requirement
`workflow-test-programs`). A result is a string (the program's text), `{ output: <value> }` or
`{ fails: "<message>" }` with a message. `{}` and extra keys fail. The key is optional, so older
files read as before. Starting these programs in a test needs the test runner's side, which isn't
in this package.

## Harness agents

Three optional agent fields say how an agent runs in another program
(requirement `agent-sandbox-fields`):

- `harness`: `halonic` (the default), `claude-code` or `codex`. The list is
  closed, so a typo fails `halonic validate`, and **each new harness changes
  the format**: add its value to `AgentHarness` with a requirement.
- `workingFolder`: the one workspace folder the agent writes to;
  `defaultWorkingFolder(id)` gives `files/agents/<id>`. Paths that leave the
  workspace or go through a folder starting with `.` at any depth (`.git`,
  `.claude`, `.vscode`: tools run hooks and tasks from there), `hubs`, a kind's folder
  or a kind file in the root fail, in any case and in fullwidth forms. Names
  Windows would read as another name (a trailing `.` or space, `:`, `GIT~1`)
  fail too. `workingFolderProblem(path)` gives the reason a path fails, or
  `null`, and `PROTECTED_TOP_NAMES` lists the top names a working folder can't
  start with. The sandbox profile builder (`@halonicjs/adapter-harness-kit`)
  checks the path again with them after it resolves symlinks.
- `allowedSites`: at most 50 host names or `*.` plus a domain of two or more
  labels. Addresses in any notation and local names (`.local`, `.internal`,
  `.arpa` and the like) fail. `asciiAllowedSites(sites)` gives the stored form: lowercase,
  Punycode, each once.

## Workflow tests

A test case in `workflows/<id>.test.yaml` scripts everything a run would reach outside the
workflow: `mocks` (model replies per agent), `tools` (connector tool results), `events` and the
optional `programs` (requirement `workflow-test-programs`). `programs` maps an agent id to a list of
results for the programs that agent starts, used in the order the engine starts them. A result is a
string (the program's text), `{ output: <any value> }` or `{ fails: "<message>" }` with a
non-empty message. Any other shape fails. Tests never start a real program.
