# @halonicjs/adapter-harness-codex

Runs Codex as an agent's harness. It finds the `codex` program, checks its
version and whether someone is signed in, and points it at the run's
Halonic bridge. Codex always runs inside Halonic's sandbox; integrations,
secrets and approvals stay in Halonic.

- **Layer:** adapters
- **Owner:** owen
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-harness-codex`

So far it has `detectCodex` and `codexEnvironment`, and, inside the package,
the reader that turns the notifications of `codex app-server` into run
events. Starting a run (`start`, `send`, `cancel`) follows (HAL-194 build
plan, D3).

## Reading Codex's notifications

The reader turns a shell command, a file change, a call to an MCP tool and
an image Codex looks at into `tool.called` and `tool.result` (`shell`,
`apply_patch`, `mcp__<server>__<tool>`, `view_image`). A call to the
bridge's MCP server (`halonic`) and every model call are left out: the bridge
records those. `turn/completed` is the run's final `agent.finished`, with the
agent's last message as output; a failed or interrupted turn ends the run
with an error. Other threads, and notifications and items it doesn't know,
are skipped. Subagents (Codex's `collabAgentToolCall`) aren't reported yet.

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

## Supported versions

Codex 0.166.0 or newer (`supportedVersions`): the release checked by hand on
10 Nov 2026, one behind the latest. `codex --version` prints
`codex-cli 0.166.0`; Codex also ships pre-releases such as
`codex-cli 0.169.0-alpha.6`, which are ordered the semver way, so
0.166.0-alpha.3 is older than 0.166.0.

## Sign-in

`codex login status` exits with 1 and prints "Not logged in" when no one is
signed in; `detect()` then answers `signed-out`. It also exits with 1 when it
can't read its settings or the stored sign-in, with another message: that,
and any other answer, is `ready`, because Halonic never guesses. Its output
can show part of an API key, so it is never passed on.

## The run token

Codex sends the run token to the bridge in the `x-halonic-run-token` header.
`codexEnvironment` puts it in `HALONIC_RUN_TOKEN`, and the bridge provider in
the agent's `config.toml` names that variable in `env_http_headers`, so the
token never lands in a file. The bridge's address goes in `config.toml`
(D3): Codex reads a custom provider's address only from there.
