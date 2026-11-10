# @halonicjs/adapter-harness-codex

Runs Codex as an agent's harness. It finds the `codex` program, checks its
version and whether someone is signed in, and points it at the run's
Halonic bridge. Codex always runs inside Halonic's sandbox; integrations,
secrets and approvals stay in Halonic.

- **Layer:** adapters
- **Owner:** owen
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-harness-codex`

So far it exports `detectCodex`, `codexEnvironment` (with its `CodexFolders`
type) and the constants around them (`codexProgram`, `codexRunTokenVariable`,
`supportedVersions`, `oldestSupportedVersion`). Inside the package, and not
exported, are the client that talks to `codex app-server` and the reader that
turns its notifications into run events. Starting a run (`start`, `send`, `cancel`)
follows (HAL-194 build plan, D3).

## Talking to `codex app-server`

Codex runs as `codex app-server`, which speaks JSON-RPC over its standard
input and output, one JSON object per line and without the `jsonrpc` field.
`AppServerClient` opens with `initialize` and `initialized`, matches answers
to requests by id, hands Codex's notifications and its own requests (such as
approvals) on in order, and answers those. A line that isn't JSON-RPC, or is
longer than 16 MiB, stops the reading with an error that never quotes it, and no error holds the
bridge token. The protocol was checked with
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
import { codexEnvironment, detectCodex } from "@halonicjs/adapter-harness-codex";

const found = await detectCodex(probe);
if (found.status === "ready") {
  const env = addHarnessEnvironment(profile.env, codexEnvironment(bridge, profile));
  const session = await sandbox.open({ ...profile, env });
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
`HALONIC_RUN_TOKEN` in `env_http_headers`, so the token never lands in a file. The bridge's address goes in `config.toml`
(D3): Codex reads a custom provider's address only from there.
