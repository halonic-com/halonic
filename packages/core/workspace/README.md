# @halonicjs/workspace

Loads one workspace through a `DefinitionSource`: every file is parsed with the kind its place
gives, and every problem comes back with its file, key path, line and column. It also builds the
workspace's trust content and its fingerprint: everything that decides which programs run and where
they talk to.

- **Layer:** core
- **Owner:** elena
- **Public API:** `@halonicjs/workspace`

## Example: load a workspace

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
    ["workspace.yaml", "id: acme\nname: Acme\n"],
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
- **A file the account may not read** (`EACCES`, or `EPERM` on Windows) makes `loadWorkspace` throw
  an `invalid_input` error that names the file by its workspace path and says to check its
  permissions or move it out of the workspace (`workspace.unreadable-file`). A folder store's
  `version()` reads every file, so when it fails that way the loader reads each listed file to find
  the one to name; any other error from the source reaches the caller as it is.
- **Ignored files** are those no kind places, such as a README or a file in an older layout. The
  reserved `.halonic/` folders are skipped without being listed.
- **Checks across files** run after every file is parsed. They report, with the old loader's
  messages, a name one file gives that no other file has (an agent's model alias, skill or subagent;
  a provider in `models.yaml`; a test's workflow), agents that delegate in a loop, two files with
  one id, a missing `workspace.yaml`, a workflow's own rules and the agents, workflows and methods
  it names, workflows that run each other in a loop, and a routine whose hub, workflow, agent, mail
  connector, cron, time zone or interval is wrong. Each issue has the file, key path and line of the
  name. A file that failed its own checks counts as missing, so whatever names it is unknown.
  `src/parity.test.ts` compares these messages, file by file, with the old loader's on every
  parity fixture; the parity package's `allowed-differences.json` lists where they differ.
- **Where names are looked up:** an agent's skills, knowledge, collections and connectors are its
  hub's own or shared at the root; a hub with `uses` may use only the shared items it lists. Model
  aliases come from `models.yaml` and the hub's `models`. Subagents and a test's workflow come from
  the same hub, and so do a workflow's agents and the workflows it runs. A routine runs its own
  hub's workflows and agents; one at the root names its hub in `run.hub`, unless the root has agents
  or workflows of its own.

## The files as a version holds them

`new VersionSource(vcs, commit, location)` is a `DefinitionSource` over one commit. It reads and
lists only through `Vcs.readAt` and `Vcs.listAt` at that commit, never the files on disk, so a file
saved but not yet in the version reads as it was in the version, and a file the version doesn't have
isn't found (`read` gives `null`, `list` gives `[]`). Run, routines, triggers and calls from other
agents read through it, so a saved change isn't live until it is in a version.

- **Its `version()` is the commit id**, so `loadWorkspace` gives a workspace whose `version` is that
  commit, and a run that starts from it records the commit.
- **Paths are checked first.** An unsafe or private path (`.env`, `.git`) throws a `RangeError`
  before the `Vcs` is asked, as the `DefinitionSource` port says.
- **The commit must be a full commit id.** `HEAD` or a short id such as `3f9a0c1` makes the
  constructor throw a `RangeError`; resolve the name first.
- **`VersionReader`** is the part of `Vcs` it needs (`readAt` and `listAt`), so a test can pass a few
  files in memory.

```ts
const live = new VersionSource(vcs, head, "~/workspaces/acme");
const workspace = await loadWorkspace(live);
workspace.version; // the commit id at HEAD
```

Requirement: [`workspace.definition-source-at-version`](requirements/definition-source-at-version.md).

## Model aliases and the definitions a run keeps

`resolveModel(workspace, hubId, name)` turns a model setting into a provider and a model. A name
with a `/` names them directly (`ollama/llama3`); any other name is an alias, the hub's own in its
`hub.yaml` over the one in `models.yaml`. The result has the alias's params and price and the
targets of its `fallback` entries, one level deep, as the engine tries them. An alias the hub
doesn't have gives `undefined`. `modelAliases(workspace, hubId)` gives the aliases a hub can use, by
name, which is what `resolveModel` looks them up in.

`definitionsOf(workspace, hubId)` gives everything a run in that hub reads, as plain data: the
workspace settings, `hub.yaml`, the default model, the hub's own workflows and agents, every alias
it can use resolved, the providers and runtimes, and the library items it may use.
`runDefinitionsOf` builds what a new run starts with: the workflow, the hub's agents, workflows,
collections and knowledge sources, and the `allow` and `approve` lists of the connectors the hub can
see, by connector id, and nothing else of their files (`workspace.run-definitions`).
`definitionsVersion(definitions, digest)` is the SHA-256 of their canonical JSON, through the
`Digest` port. That is the hash the `BlobStore` gives the same JSON, so the engine keeps the
definitions under the run's `definitionsVersion` and a waiting run goes on with the definitions it
started with, whatever happens to the files
([ADR](../../../docs/adr/2026-11-08-runs-are-stored-separately.md)).

## The files as a version holds them

`new VersionSource(vcs, commit, location)` is a read-only `DefinitionSource` over one commit
(`workspace.definition-source-at-version`). It reads and lists only through `Vcs.readAt` and
`Vcs.listAt` at that commit, never the files on disk, so a saved change that isn't in the version
isn't there. It refuses unsafe and private paths before it asks the version control, refuses a
version that isn't a full commit id, and gives the commit id as its `version()`, so a run loaded
from it records the commit. It needs only `VersionReader`, the `readAt` and `listAt` part of `Vcs`.
Run, routines, triggers and calls read the live version through it (save model 2.2); `@halonicjs/app`
picks the source for each run.

## A new workspace

`initWorkspace` lays out a new workspace through a `DefinitionStore` and returns what it wrote as
data, so `halonic init` and the Studio can each say it their own way:

- a `workspace.yaml` with the name and an id, made from the name unless one is given
  (`Acme Billing` gives `acme-billing`), checked with the workspace kind's own schema first;
- a `.gitignore` that lists `.env` and `.env.*`.

It writes only into an empty store, meaning one whose `list()` returns no file. The port never lists
private entries such as `.git`, `.studio` and `.env`, so a folder fresh from `git init` counts as
empty. Any other store is left alone and `initWorkspace` returns `{ kind: "not_empty" }`.
`workspace.yaml` is written last; if that write fails, the `.gitignore` is removed again, so the
store is empty once more and `initWorkspace` can simply run again.

`gitIgnorePath` and `gitIgnoreLines` are that file's name and its lines, and `settingsPath` is where a
workspace's own settings live (`workspace.yaml`).

`copyWorkspace(source, target)` lays out a copy of a workspace, such as the Acme example that
`halonic init --example acme` copies, under the same rules: it writes only into an empty store and
returns `{ kind: "not_empty" }` otherwise (`CopyWorkspaceError`), the copy gets the `.gitignore` of a
new workspace when the source has none, `workspace.yaml` is written last, and a failed write removes
what was written. A success is a `CopiedWorkspace`: the target's `location` and the `files` written.

`planHubExtract(workspace, hubId)` plans a new workspace that holds one hub alone, as data
(`ExtractPlan`): the hub's folder; `models.yaml`, the providers and the runtimes; the shared items the hub
lists in `uses` or its agents name (a skill's whole folder, a `files` knowledge source's documents, the
collections they refer to) and the workspace-level routines that run in the hub; the `.gitignore`; and the
hub's id, name and description for `workspace.yaml`. `deployments.yaml` and the other hubs stay behind. It
says `unknown_hub`, with the hubs there are, or `has_errors`, with how many, and plans nothing
(`ExtractError`). `extractHub(workspace, source, target, hubId)` writes the plan into an empty
`DefinitionStore` through `copyWorkspace`'s rules, with the original `workspace.yaml` given the hub's id,
name and description and its comments and other settings kept, and never changes the original. With
`{ dryRun: true }` it writes nothing and gives the files it would write; a target that lists a file gets
`{ kind: "not_empty" }` (`ExtractHubError`). A success is an `ExtractedHub`: the plan, the target's
`location` and the `files` written (requirement `workspace.extract`).

Checking a workspace needs no service of its own: `loadWorkspace` gives every issue with its
severity, file and line, and the caller counts the errors.

The types in the API go with these functions: `LoadedWorkspace`, `LoadedFile`, `LoadedFileOf` and
`WorkspaceIssue` for `loadWorkspace` and `filesOf`; `PlaceMatch` for `placeOf`; `ModelTarget` and
`ResolvedModelTarget` for model aliases; `HubDefinitions` for `definitionsOf`; `RunStartDefinitions` for `runDefinitionsOf`;
`InitWorkspaceOptions`, `InitializedWorkspace` and `InitWorkspaceError` for `initWorkspace`;
`CopiedWorkspace` and `CopyWorkspaceError` for `copyWorkspace`; `ExtractPlan`, `ExtractFile`,
`ExtractPart`, `ExtractSettings` and `ExtractError` for `planHubExtract`; `ExtractedHub`, `ExtractHubOptions` and
`ExtractHubError` for `extractHub`; `VersionReader` for `VersionSource`;
and the trust types listed below (`TrustContent`, `TrustContentInput`, `ConnectorTrustContent`,
`RefusedConnector`, `AgentTrustContent`, `IntegrationTrustContent`, `LocalIntegrationInput`,
`TrustSkipInput`, `TrustUrl`, `TrustChanges`, `ItemChanges`, `ChangedItem`, `ChangedConnector`,
`ChangedAgent` and `ChangedIntegration`).

## Trust content

The trust prompt shows a workspace's trust content, and `TrustService` in `@halonicjs/app` compares
its fingerprint with the trust record before anything starts. `trustContent` reads the parsed
connectors. It keeps every field that could change what runs (the command and its path, the
arguments as a list, the working folder, every environment variable, the full URL with its host in
Punycode, every header, the tool lists and `local`), and keeps any field the schema doesn't know yet
as written, under `unknown`, so it can never take the place of a known field. Secrets appear by name
only (`‹secret NAME›`), and `${HOME}` stays `${HOME}`. Only a connector's name and description are
left out.

A URL with user info (`https://ops:pw@…`), a backslash before its query
(`https://evil.test\@mcp.acme.test/` connects to `evil.test`) or no `//` after `http:` or `https:` is refused, not
normalised: the connector goes in `refused` with the reason, and `trustFingerprint` won't fingerprint
content that has any, so nothing in that workspace can be trusted or started until the file is fixed.

`trustFingerprint` hashes that content through the `Digest` port: `hfp1:` and the SHA-256 of its
canonical JSON, so key order doesn't count and `["a b"]` never matches `["a", "b"]`;
`trustFingerprintPrefix` is that `hfp1:` prefix. `trustUrl` is the URL step on its own: it gives the
normalised URL or the reason it refuses one, and `secretReference` writes a secret's name the way the
content shows it. Each behaviour has a requirement in [`requirements/`](requirements/).

Agents that run on another harness than Halonic's own loop are part of the trust content too.
`agentsTrustContent` lists each of them, sorted by id, with its harness, its allowed sites (lowercase,
Punycode, each once, sorted) and its working folder when that isn't `files/agents/<id>`. Agents with no
harness or with `halonic` add nothing, so a workspace without harness agents keeps the same content and
fingerprint as before.

`harnessWorkingFolders(workspace)` lists the same agents' working folders for whoever starts a local
connector's program, in every hub: each folder as the agent file wrote it (relative to the workspace
root, `files/agents/<id>` when it names none), each once, sorted by code unit. The caller resolves them
to real paths and passes them as `ConnectorFactoryContext.workingFolders`, so a start that would run or
load a file an agent could have written is refused (`workspace.harness-working-folders`).

Every local integration is part of it too, because Halonic starts its code in the runner.
`integrationsTrustContent` takes each integration's permission sheet, the workspace's settings for
it, its folder and the hash of its code, and lists, sorted by id: the folder, what the sheet lets
the code do (`provides`, `hosts`, `secrets` by name only, `googleScopes`, `tools` with their risk and
`untrusted` mark, and `needs`), `code`, and `addresses`: the URL each `{ fromSetting }` host holds,
normalised as connector URLs are, `null` while it isn't set, and only the reason for a URL it can't
trust. `integrationCodeDigest` makes `code`: `sha256:` and a hash of every file's path and bytes in
the folder, `integration.yaml` included, so a change to any file or to the set of files asks again;
it refuses an unclean path (requirement `workspace.trust-integration-code`). Built-in integrations
come with Halonic and add nothing, so a workspace without local integrations keeps the same content
and fingerprint as before.

`reachesOnlyTheTestModel` says when a run needs no trust at all: every provider is `mock`, there is no
local integration and the trust content is empty, so nothing starts outside Halonic.

When the fingerprint no longer matches, `trustChanges` compares the trusted content with the current
one and lists the new, changed and removed connectors, harness agents and integrations, so the prompt
can show New and Changed first. Only removing whole connectors, harness agents or integrations lets
the record shrink without asking (HAL-65 decision 9). Any change
inside a connector asks again, even one that takes something out of the file, because dropping a
tool from `approve`, the `allow` list or a variable can let the connector do more.

### Example: trust content

The trust content of a made-up `acme` connector. This example is
[`examples/trust-content.ts`](examples/trust-content.ts), which
`src/example.test.ts` runs and checks. The file imports `../src/index.ts`, because a package may not import
itself by name.

```ts
import type { Connector } from "@halonicjs/format";
import { trustContent } from "@halonicjs/workspace";

/** A made-up `acme` mail connector that starts a program. */
const mail: Connector = {
  version: 1,
  id: "mail",
  name: "Mail",
  transport: {
    stdio: {
      command: "node",
      args: ["./scripts/mail.js", "--inbox", "work"],
      cwd: "./tools/..",
      env: { MODE: "safe" },
      secretEnv: { MAIL_TOKEN: "mail-token" },
    },
  },
  tools: { approve: ["send_mail"] },
};

/** Builds the trust content of the `acme` workspace's one connector. */
export function runExample(): unknown {
  return trustContent({
    connectors: [mail],
    commandPaths: new Map([["node", "/usr/bin/node"]]),
  });
  // {
  //   connectors: [{
  //     version: 1, id: "mail", transport: "stdio",
  //     settings: {
  //       command: "node", path: "/usr/bin/node", args: ["./scripts/mail.js", "--inbox", "work"],
  //       cwd: ".", env: { MODE: "safe" }, secretEnv: { MAIL_TOKEN: "‹secret mail-token›" },
  //     },
  //     tools: { approve: ["send_mail"] },
  //   }],
  // }
}
```
