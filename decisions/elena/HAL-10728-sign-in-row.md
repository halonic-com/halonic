# Decision: `sandbox.opened` says how the agent signs in, and the run page shows it

- Approval: board approval of proposal 1 ("What this run can do") in the `proposals` document on HAL-1601; the field (P3) on HAL-1782; the sign-in checks closed on HAL-1710 (19 Nov, wording unchanged); the words approved on HAL-1784; the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:dZZLk0GAVwMeBf2F108HXv9Tlb9wafD8+H4gLkWRJvYqzpeVcvcHfByiEfaRpqpnPNG5DFFH7q0+L751Q8W3Cw==
- Task: HAL-10728

## What changes

- `events.sandbox-opened`: the view gains an optional `signIn`, either
  `{ kind: "key", provider }` or `{ kind: "subscription", provider: "anthropic" | "openai" }`.
  `sandboxOpenedView` copies only those two fields from the sign-in it is given, and
  `readSandboxOpened` reads a view without one and gives `null` for a damaged one. The type
  test that pins the view gains the field.
- `engine.run-harness`: `sandbox.opened` records the sign-in for the harness's provider
  (Anthropic for Claude Code, OpenAI for Codex), from the access the bridge reaches it with. The
  engine's `HarnessBridgeHost.open` now gives a `HostedHarnessBridge`, which may name its
  `providers`.
- `harness-host.bridge` and `agent-host-client.bridges`: both bridge hosts give the engine the
  providers they opened the bridge with.
- `runs.run-view.sandbox-panel`: the list gains the **Your sign-in** row after Time limit, with
  the two approved sentences, shown only when the event has a `signIn`.

## Why

- The run page reads only the log (Julian, HAL-1673), so how the agent signed in has to be in
  the event. Only the host knows it, through the bridge's providers, so the engine takes it from
  the bridge it opened rather than from the agent's current settings.
- The event names a key's provider by the provider file's id (`zai`), never the secret's name
  or the address, and a subscription only by its provider. That keeps Julian's fixed allow-list:
  tests check that a secret's name and address never reach the event.
- `signIn` is optional, so events logged before it, and a host that doesn't say, read fine and
  show no row instead of "Couldn't read".

No test was weakened or removed.

## Covers

- events.sandbox-opened
- engine.run-harness
- harness-host.bridge
- agent-host-client.bridges
- runs.run-view.sandbox-panel
- packages/core/events/src/run-event-fields.test.ts
