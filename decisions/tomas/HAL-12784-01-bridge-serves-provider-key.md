# Decision: the CLI's bridge serves a sandboxed harness agent a provider key Halonic keeps

- Approval: the plan and three additions approved by Liam on HAL-12784; the package owner (Liam) approves this note in review
- Kind: user-visible

## What changes

`cli.local-harness-host` said "The bridge shall be given no secrets, since every agent signs in
with its own program." A sandboxed Claude Code or Codex agent can't reach the person's own sign-in,
so its run failed as signed out (HAL-12475). The sentence now says the bridge reads only the
provider keys that the new `cli.harness-provider-key` allows, and serves each agent the access it
decides. Nothing else in that requirement changes.

- New: `cli.harness-provider-key` (the CLI side) and `harness-host.provider-access` (the shared
  rules, which Studio will use too).
- Tests: in `bridge-host.test.ts`, the two tests that check what `servicesFor` is told now also
  expect where the agent runs (`runsOn: "sandbox"`), which the bridge host takes from the
  placement the engine opens the bridge with. No assertion is removed or weakened.
- From Liam's security review: `providerAccessOf` refuses, rather than spend another provider's
  key, when the agent's model points to a provider of that type with no `secret`
  (`harness-host.provider-access` rule 4, with a test). `cli.harness-provider-key` now says the
  trust and allowed-address checks run when the bridge opens, not on every call, and its test also
  checks that no file the program may read holds the key.
- In the new `harness-provider-key.test.ts`, the three tests that call the CLI's bridge on its Unix
  socket skip on Windows (`it.skipIf(noUnixSockets)`, named `[platform:win32] …` as the skip
  reporter asks). Windows has no Unix socket, and the CLI stops before the bridge there anyway;
  the requirement is still checked on Linux and macOS.

## Why

On this computer the program's own sign-in still works and spends nothing, so it is kept. In the
sandbox, the key of a provider the workspace already names (`providers/<id>.yaml` with `secret`) is
the safe way: the bridge puts its value in place of the program's own key, so the program never sees
it, and sends it only to that provider's address. A missing value stops the run before the program
starts, and the value is scrubbed from every bridge failure before the run log records it.

## Covers

- cli.local-harness-host
- cli.harness-provider-key
- harness-host.provider-access
- packages/host/harness-host/src/bridge-host.test.ts
- apps/cli/src/harness-provider-key.test.ts
