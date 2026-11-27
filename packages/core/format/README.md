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
| `workspaceTemplate` | `template.yaml`, at the workspace root; commands read it, the workspace loader doesn't |

Most kinds can also sit inside a hub folder; `fileKinds[kind].places` has the
exact places (`integration` and `plugin` have none: they live outside workspaces;
`workspaceTemplate` has none either, so a template that fails never fails the workspace).
`kindNames()` lists the kinds and `isKindName(text)` tells whether a text names one. Each kind's
folder in `src/kinds/` holds its schema and its tests. Checks between files belong to the loader,
not here.

## Other exports

- `jsonSchemaOf(kind)` gives a kind's JSON Schema (see Spec files below).
- `SCHEMA_VERSION` is the file format version, written as `version` in files.
- `RESERVED_FOLDER` (`.halonic`) and `isReservedPath(path)`: Halonic's own data folder at the
  workspace root and in each hub, which the loader skips (requirement `reserved-folder`).
- `connectorIsLocal(connector, hosts?)` says whether a connector counts as local for `privacy.localOnly`,
  counting the `outsideHosts` of a plugin's or local integration's sheet when given (every fixed
  host, and a `public` setting host). `connectorIsLocalWith(connector, sheets?)` does the same with
  `SheetHosts`, the sheets' hosts a host read, so `validate` and the engine's run connectors decide
  alike;
  `needsApproval(tools, name)` and `approveAll` (`"all"`) read a connector's `tools.approve` setting.
  `marksRead(tools, name)` says whether its `tools.read` list marks a tool as only reading; `approve`
  wins when both name a tool.
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
- Routines: a `webhook` trigger takes a `secret` (the name of the secret that signs the request body,
  never its value; a name that belongs to Halonic or a plugin fails with `secret-name-reserved`, as a
  connector's does) and the `headers` a run may read; `WEBHOOK_REFUSED_HEADERS` lists the headers it
  refuses, such as `authorization` and `cookie` (requirement `routine-webhook`). A mail trigger's
  `every` is a number followed by `m`, `h` or `d`, such as `15m` (requirement `routine-mail-interval`).
  A routine's `run` is a workflow with its `input`, named fields such as
  `input: { mail: "{{trigger.body}}" }`, or an agent with its `prompt`. A workflow whose `input` is
  a text or a list fails at `run` with "A workflow routine's input needs named fields, such as
  input: { mail: "{{trigger.body}}" }.", and an agent with `input` and no `prompt` with "An agent
  routine takes prompt, not input." (requirement `routine-file`).
- Providers: a provider file's `secret` names the secret its key is kept under; a name that belongs
  to Halonic or a plugin fails with `secret-name-reserved`, as a connector's does, so the first run
  never saves a model key under it (requirement `provider-secret-reserved`).
- Connectors: besides the local and remote transports, `integration: { folder: <id> }` (a folder
  under `integrations/`) and `plugin: { id: <id> }` run in the integration runner. An `integration`
  transport may also hold `settings` (plain values, such as the `url` a `{ fromSetting }` host
  reads) and `secrets` (sheet secret name → workspace secret name). Such a connector
  is local only when its own `local` key says `true` (requirement `connector-runner-transports`).
- Sign-ins: an integration sheet may declare `signIns` (the `oauth-code` flow, with its URLs, scopes
  and the hosts it may reach), which need `kit` 2 or higher; a plugin's backend may declare them
  with `sdk` 2 or higher (requirements `integration-sign-ins`, `plugin-backend-sign-ins`).
- Plugin settings and `ui`: `PluginSettingField`, `PluginSettingValue` and `settingValueProblem(field,
  value)` check a setting's value; a `ui` command or card must name a declared tool whose `risk` is
  `read` (`tool-not-read`, requirement `plugin-ui-read-tools`).
- The types of each kind's value (`Agent`, `Workflow`, `Routine` and so on) and `Guard`.

## Subpath exports

These entry points never import `yaml`, so a reader that doesn't parse workspace files doesn't load
the YAML parser. `@halonicjs/format` doesn't re-export `./recording` or `./runtime-export`.

- `@halonicjs/format/integration` is the integration permission sheet: `IntegrationSheet`,
  `parseIntegrationSheet`, `checkIntegrationSheet`, `integrationPolicy`, the pattern and limit
  constants, and the plugin helpers `Plugin`, `backendSheet` and `pluginFromIntegrationSheet`. The
  integration kit and the conformance suite read sheets through it
  (requirement `integration-entry`).
- `@halonicjs/format/recording` is the recording file, `integrations/<name>/recordings/<scenario>.json`,
  shared by the recorder and the conformance suite: `recordingFileSchema` (with the type
  `RecordingFile`), `formatRecording` and `RECORDING_FORMAT` (`halonic.recording/1`).
- `@halonicjs/format/runtime-export` is the manifest of `halonic deploy export` and `import`, the
  folder that holds one deployment's runtime data: `runtimeExportManifestSchema` (with the type
  `RuntimeExportManifest`), `RUNTIME_EXPORT_FORMAT_VERSION` and `RUNTIME_EXPORT_MANIFEST`
  (`halonic-export.json`). A file is under `runs/`, `records/` or `blobs/`, and the manifest and
  each entry refuse any key they don't list, so no secret store has a place in an export
  (requirement `runtime-export`). It imports only schema-kit and ports.

## Spec files

`spec/<kind>.schema.json` (for example `spec/workflow-test.schema.json`) is each kind's JSON
Schema (2020-12), as `jsonSchemaOf` emits it. `spec/runtime-export.schema.json` is the export manifest's, checked by its own test. These files are the source of truth for anyone
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
keyed `<connector>.<tool>`), `events` (what a run waits for and is sent) and `programs`. `programs` maps an agent id to a list of results for the
programs its harness starts, used in the order the engine starts them (requirement
`workflow-test-programs`). A result is a string (the program's text), `{ output: <value> }` or
`{ fails: "<message>" }` with a message. `{}` and extra keys fail. The key is optional, so older
files read as before. Starting these programs in a test needs the test runner's side, which isn't
in this package.

## Deployments

A deployment in `deployments.yaml` may have a `cloudflare` block (`worker`, required: 1 to 63
lowercase letters, digits or `-`, not at the start or end; `domain`, a lowercase host name;
`location`, only `eu`; and `account`, the account id: exactly 32 lowercase hexadecimal characters,
never the account's name) and a `limits` block (`dailyRequests`, a whole number above zero, and
`scopeDailyRequests`, one scope's share of it: a whole number above zero, at most `dailyRequests`,
and only next to it. One scope can use at most a tenth of the day unless you set it). Other
keys in either block fail. A `cloudflare` block on a deployment whose `host` isn't `cloudflare`
only warns (`cloudflare-settings-unused`). The account id isn't a secret; no token or key goes in
the file (requirements `deployments-cloudflare` and `deployments-cloudflare-account`).

A deployment may also have a `users` block: who may use it and how their usage is counted
(requirement `deployments-users`). Without the block nothing changes.

```yaml
deployments:
  web:
    name: Web
    host: cloudflare
    users:
      mode: many           # owner (the default) or many
      meter: config        # none (the default), config or cloud
      config:
        limits:
          - { unit: cost, amount: 20, period: month }
          - { unit: harnessMinutes, amount: 600, period: month, action: notify }
```

- `mode`: `owner` is for the deployment's owner alone; `many` is for many people, each signed in
  to their own space.
- `meter`: `none` counts nothing; `config` counts against the `config` limits; `cloud` counts
  with Halonic Cloud, for the product in `cloud.product` (its id, not a secret), which it then
  needs (`users-cloud-product-missing`). The deploy service refuses a deployment with
  `meter: cloud` (requirement `app.deploy-cloud-meter`).
- This package reads and checks the block. Nothing acts on `meter: config` yet.
- With `mode: many`, other people start the runs, so a harness agent (Claude Code or Codex) with
  no provider key, which would run on your own sign-in, fails `halonic validate` at its `harness`
  (`users-many-subscription`, requirement `workspace.many-users-subscription`). The deploy and
  the run start refuse it with the same code.
- With `mode: many`, `meter: config` and a `cost` limit that stops, a model without a `price`
  would count no cost, so the limit would never stop it. Every agent that could call one (its
  alias or a fallback has no price, it names `provider/model`, or a harness agent names no model)
  fails `halonic validate` (`users-many-unpriced-model`, requirement
  `workspace.many-users-unpriced-model`), and a run that uses it doesn't start. A model that
  really costs nothing gets `price: { input: 0, output: 0 }`.
- A limit has a `unit` (`runs`, `steps`, `tokens`, `cost` or `harnessMinutes`), an `amount` above
  zero, a `period` (`day`, `month`, `run` or `step`) and an `action` at the limit (`stop`, the
  default, or `notify`). Two limits on the same unit and period fail (`users-limit-repeated`).
- A `config` or `cloud` block for a meter the deployment doesn't use only warns
  (`users-meter-settings-unused`), so switching meters changes only `meter:`.
- `meter: config` with no limits at all counts nothing, like `meter: none`, so it warns
  (`users-config-limits-missing`).

A `mode: many` deployment lists in `users.exposed` the workflows its end users may start, and
everything they see of them (requirement `deployments-users-exposed`). The deploy file is the one
place for this; workflow files don't change.

```yaml
    users:
      mode: many
      exposed:
        - workflow: support-reply
          name: Ask support
          description: Answers a question about your order.
          kind: chat                       # chat or form
          inputs:
            question: { label: Your question, help: One or two lines. }
          shows:
            answers: [reply]               # states whose answers are shown
            results: [summary]             # context keys shown as results
            approvals:
              shop/refund: "Refund {amount} to {customer}?"
```

- Nothing is exposed or shown unless it's listed: no `exposed`, an empty list or an empty
  `answers`, `results` or `approvals` shows nothing, and there are no wildcards.
- `{arg}` places in an approval text are filled with the call's arguments; the text is shown as
  plain text, never as markup.
- `exposed` on a deployment whose `mode` isn't `many` fails (`users-exposed-needs-many`).

`config` may also list `organisations`: groups of people who share one pool of limits, in the
shape of an organisation in Halonic Cloud.

```yaml
      config:
        organisations:
          - id: org_acme0000000000001       # org_ and 16 to 40 letters or digits
            limits:                          # the pool all members share
              - { unit: cost, amount: 100, period: month }
            concurrency: 4                   # runs at once, all members together
            members:
              - { actor: eu_anna000000000001, role: owner }
              - actor: eu_ben0000000000001   # eu_ and 16 to 40 letters or digits
                role: member                 # owner, admin or member
                limits: [{ unit: cost, amount: 20, period: month }]
                concurrency: 1
```

- Each organisation needs an `owner` (`users-organisation-owner-missing`), lists a person once
  (`users-member-repeated`) and has its own `id` (`users-organisation-repeated`).
- As in `config.limits`, a pool's or a member's `limits` hold one limit per `unit` and `period`
  (`users-limit-repeated`).
- A member's `limits` are a share of the pool: each needs a pool limit on the same `unit` and
  `period` (`users-member-limit-outside-pool`) and can't be above its `amount`
  (`users-member-limit-above-pool`). A member's `concurrency` can't be above the organisation's
  (`users-member-concurrency-above-organisation`).

## Model call limit

An agent's `maxSteps` is its model call limit: the most model calls it makes
in one workflow step, 1 to 200, 6 by default. A step whose agent used them all
and still calls tools fails, and `halonic run` says to raise `maxSteps` in the
agent's file (requirement `engine.run-step-limit`).

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
  Punycode, each once. A stdio connector's optional `transport.stdio.sites`, the sites its
  program may reach in a sandbox, follows the same rules (requirement `connector-sites`); no
  other transport takes it.

A harness agent's `model` is usually a name its program knows, such as
`sonnet`. When it is an alias of the hub's models instead, the program runs
that alias's model through the alias's provider, with the provider's key,
wherever the agent runs: a `type: anthropic` provider for Claude Code, and
`openai` or `openai-compatible` (an address that speaks OpenAI's Responses API)
for Codex. That is how a harness agent runs an open model, such as GLM through
Z.ai's Anthropic-compatible address. Only the alias's own target counts, not
its fallbacks (requirement `cli.harness-model-access`).

Some models search the web by themselves, such as `perplexity/sonar` at
OpenRouter. That search happens at the provider, outside Halonic's tools and
approvals. A provider file can list such models in an optional `searchesWeb`
(requirement `provider-searches-web`), each model id once:

```yaml
id: openrouter
type: openai-compatible
baseUrl: https://openrouter.ai/api/v1
secret: OPENROUTER_API_KEY
searchesWeb: [perplexity/sonar, perplexity/sonar-pro]
```

`halonic doctor` warns about each harness agent whose alias points at one
(requirement `app.doctor-harness-web-search`); it never blocks the agent.
An id counts only when it matches an alias's `model` exactly. A suffix that
turns search on for any model, such as OpenRouter's `:online`, isn't detected
yet.

An optional `harnessLimits` block bounds one step of a harness agent
(requirement `agent-harness-limits`): `maxSteps` (model calls, 1 to 10000),
`maxMinutes` (1 to 1440, not counting waits for a person's answer) and
`maxCost` (in the budget's currency, above 0; calls a subscription pays for
count as 0) and `maxTokens` (1 to 1000000000, every token of the step's model
calls, sub-agents' and subscription calls included). A limit left out doesn't apply. The agent's own `maxSteps`, 6 by
default, is sized for Halonic's own loop and doesn't bound a harness step: a
coding program makes hundreds of model calls in one.

An optional `answerRetries` field, 0 or 1, says how often a `task` step asks
the agent again when its answer doesn't fit its `json` or `choice` output
(requirement `agent-answer-retries`). Left out, it is 0: the first unusable
answer fails the run.

An optional `asks` field says when a Claude Code or Codex agent's own tools
ask for a person's OK (requirement `agent-asks`): `always`, the default, or
`in-sandbox`. With `in-sandbox`, and only while the run is inside Halonic's
sandbox, Halonic answers the Claude Code calls that stay in the agent's
working folder, in the CLI and in Studio alike, and logs each one as
`harness.allowed`; Codex runs its commands without asking. Without the
sandbox both ask again. With `always`, or no `asks`, Codex asks before nearly
every command, even `ls`, so a `halonic run` that nobody watches waits for an
answer: give such an agent `asks: in-sandbox`. On `halonic` or no harness the
file fails with `asks-needs-a-program-harness`, even for `always`, because
Halonic's own loop has no program tools to ask about.

With `in-sandbox`, the sandbox, not a person, is what limits a command the
agent runs: it writes only to the working folder and reaches only the bridge
and the agent's `allowedSites`. So a command can send whatever it can read to
those sites without anyone seeing it first. Keep `allowedSites` to the sites
you would let the agent send your files to. Each Claude Code call Halonic
answers is in the run log as `harness.allowed`, and the run's changes still
come back as a proposal you accept or reject.

## Components in chat replies

An optional `chatUi` block lets an agent draw components in its Studio chat
replies instead of text only (requirement `agent-chat-ui`). Its one field,
`components`, names the ones it may use: `card`, `table`, `form` and
`buttons`, at least one, each once.

```yaml
id: helper
name: Helper
chatUi:
  components: [card, table, form, buttons]
```

Left out, components are off and the agent replies in text. An unknown name,
such as `chart`, fails with a message that names it and lists the four known
ones. `chatUi` only says how a reply may be shown; `output` still says what
the answer's data is, and neither changes the other. A component never
changes what a run may do: a button or a form sends a chat message the user
can see, as if they had typed it.

In Studio's Try it chat, an agent with `chatUi` is told which components it
may draw, and only those. Only the newest reply's buttons and form work; once
one is used, it keeps a tick as a record of what was sent.
