# @halonicjs/adapter-harness-codex

Runs Codex as an agent's harness. It finds the `codex` program, checks its
version and whether someone is signed in, and points it at the run's
Halonic bridge. Codex always runs inside Halonic's sandbox; integrations,
secrets and approvals stay in Halonic.

- **Layer:** adapters
- **Owner:** owen
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-harness-codex`

`codexHarness({ probe })` is the `Harness` the host offers for
`harness: codex`. A run writes `config.toml` to the agent's settings folder,
starts `codex app-server` inside the run's sandbox session with the bridge's
address as `-c` settings, starts an ephemeral thread in the working folder
(with the agent's model and instructions, when its file sets them) and a
turn with the prompt, and turns what Codex sends into run events. Once the
turn completes, it stops Codex and ends with the agent's answer. `send`
passes a person's answer into the running turn (`turn/steer`). `cancel`
stops Codex and everything it started.

It also exports `detectCodex`, `codexEnvironment` (with its `CodexFolders`
type) and the constants around them (`codexProgram`, `codexRunTokenVariable`,
`supportedVersions`, `oldestSupportedVersion`). Inside the package, and not
exported, are the client that talks to `codex app-server`, the reader that
turns its notifications into run events and the `config.toml` text.

## Talking to `codex app-server`

Codex runs as `codex app-server`, which speaks JSON-RPC over its standard
input and output, one JSON object per line and without the `jsonrpc` field.
`AppServerClient` opens with `initialize` and `initialized`, matches answers
to requests by id, hands Codex's notifications and its own requests (such as
approvals) on in order, and answers those. A line that isn't JSON-RPC, or is
longer than 16 MiB, stops the reading with an error that never quotes it, and no error holds the
bridge token. The run answers a request it doesn't handle, such as
`item/tool/requestUserInput`, with an error, so Codex never waits. The
protocol was checked with
`codex app-server generate-json-schema` and a recorded session of Codex
0.166.0.

## Reading Codex's notifications

The reader turns a shell command, a file change, a call to an MCP tool and
an image Codex looks at into `tool.called` and `tool.result` (`shell`,
`apply_patch`, `mcp__<server>__<tool>`, `view_image`). A call to the
bridge's MCP server (`halonic`) and every model call are left out: the bridge
records those. `turn/completed` is the run's final `agent.finished`, with the
agent's last message as output; a failed or interrupted turn ends the run
with an error; when the model provider refused the key or sign-in (HTTP 401),
the error doesn't repeat the provider's answer, which can hold part of a key.
Other threads, and notifications and items it doesn't know, are skipped.

Codex 0.166.0 has its subagents (`multi_agent`) on by default. A subagent
Codex spawns becomes `agent.started` with the agent that started it as
`parent`, and each turn it completes `agent.finished` with the same
`parent`; its tool calls carry its own name. Codex gives its subagents no
type, so they are called "subagent", "subagent-2" and so on. A subagent sent
another task after it finished starts again under the same name. A failed
subagent turn finishes the subagent with what went wrong and the run goes
on. Codex's other subagent calls (`wait`, `closeAgent` and the like) give no
event.

## Example

```ts
import { addHarnessEnvironment } from "@halonicjs/ports";
import { codexHarness } from "@halonicjs/adapter-harness-codex";

const codex = codexHarness({ probe });
if ((await codex.detect()).status === "ready") {
  const env = addHarnessEnvironment(profile.env, codex.environment?.(bridge, profile) ?? {});
  const session = await sandbox.open({ ...profile, env });
  const run = codex.start(task, session, bridge);
  for await (const event of run) {
    if (event.type === "approval.requested") await run.send(await askPerson(event));
    else record(event);
  }
}
```

## What `detectCodex` answers

`detectCodex(probe)` never throws. It answers `missing` (no `codex` on the
path), `failed` (`codex --version` couldn't run or printed no version; the
sentence holds none of Codex's output), `unsupported` (older than the
supported version; it doesn't ask about sign-in), `signed-out` or `ready`.

## Supported versions

Codex 0.166.0 or newer (`supportedVersions`): the release checked by hand on
10 Nov 2026, one behind the latest. `codex --version` prints
`codex-cli 0.166.0`; Codex also ships pre-releases such as
`codex-cli 0.169.0-alpha.6`, which are ordered the semver way, so
0.166.0-alpha.3 is older than 0.166.0.

## Approvals

When Codex asks for a person's OK before a command or a file change
(`item/commandExecution/requestApproval`, `item/fileChange/requestApproval`),
the harness reports `approval.requested` with the tool and arguments its
`tool.called` already gave, and the item's id as `callId`.
`PendingApprovals` keeps each request until a person decides, and answers
Codex with `accept` or `decline`; on `decline` the agent goes on without
the call. With its own sandbox off, Codex 0.166.0 asks only when a rule in
its settings says a command needs an OK (checked with a recorded run).

## Sign-in

`codex login status` exits with 1 and prints a line that is exactly "Not logged
in" when no one is signed in; `detectCodex` then answers `signed-out`. It also exits with 1 when it
can't read its settings or the stored sign-in, with another message: that,
and any other answer, is `ready`, because Halonic never guesses. Its output
can show part of an API key, so it is never passed on.

## The run token

Codex sends the run token to the bridge in the `x-halonic-run-token` header.
`codexEnvironment` puts it in `HALONIC_RUN_TOKEN` and in no other variable, and
sets `CODEX_HOME` to the agent's own settings folder, never the person's
`~/.codex`. If the profile has no settings folder it throws an error that
doesn't hold the token. The bridge provider in the agent's `config.toml` names
`HALONIC_RUN_TOKEN` in `env_http_headers`, so the token never lands in a file.

## `config.toml`

`CODEX_HOME` is the agent's settings folder, and its `config.toml` holds the
same text for every run, in a sandbox or on this computer (`codexConfigText`):

- the model provider `halonic`: the bridge, with the Responses API and the
  run token header. `requires_openai_auth` lets a person's own ChatGPT
  sign-in through to the bridge; without one, Codex sends no
  `Authorization` and the bridge uses Halonic's key.
- `sandbox_mode = "danger-full-access"`: Codex's own sandbox is off, because
  Halonic's sandbox is already around it and the two don't nest.
- `approval_policy = "on-request"`: Codex asks for an OK when it wants one,
  and the harness turns that into `approval.requested`.
- `web_search = "disabled"` (decision 7, HAL-2076): the agent reaches the
  web only through Halonic's tools.
- the MCP server `halonic`: the bridge, with the same header.

The bridge's address changes with each run, and Codex reads a provider's
address only from its settings, so it goes on the command line instead:
`codexConfigArgs(bridge)` gives `-c model_providers.halonic.base_url=…/v1`
and `-c mcp_servers.halonic.url=…/mcp`. That way two runs of one agent never
rewrite each other's file. Checked by hand with Codex 0.166.0: `config/read`
gives back each value, and a turn reaches the bridge with the token header.
