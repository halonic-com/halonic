# Decision: Studio serves a sandboxed harness agent a provider key Halonic keeps

- Approval: the plan and Liam's four changes approved on HAL-13795; the package owner (Liam) approves this note in review
- Kind: user-visible

## What changes

Studio's harness agents ran signed out: Studio runs only sandboxed agents, and their bridges served
only the program's own sign-in. Studio now serves them the provider key the CLI would
(`cli.harness-provider-key`), through `ProviderKeyServices` from PR 1, on the workspace the engine
loaded, the keychain and the model calls' own key check. No existing requirement changes.

- New: `studio.harness-provider-key`, `agent-host-client.bridge-provider-keys` and
  `agent-host.bridge-key-scrub`.
- `bridgeKeyProviders` moves from the Node bridge into `@halonicjs/ports`, so the Node bridge and
  Studio work out `keyProviders` by one rule (Liam's change 2). `harness-kit`, the first idea,
  can't be imported in Studio's page: it uses Node.
- `AgentHostBridges.open` takes where the agent runs, as the engine already passes it, and
  `servicesFor` is told the agent's harness and placement. In `bridge-agent.test.ts` and
  `bridges.test.ts` the expectations now include them. No assertion is removed or weakened.
- An agent whose `model` is an alias gets the CLI's rules from #3964 (HAL-12488): `EngineService`
  binds the model calls' alias check to the workspace's trust and the keys' allowed addresses, and
  the engine asks the program for the alias's model through `keys.models`.
- The key's value is scrubbed twice, as the run token is: in the agent host, then in Studio before
  the run log records a `bridge.failed`.

## Wording decided by the team

It builds on the approved Settings › Models screen, so the team decides it (Liam, HAL-13795):

- Missing key: *The secret "<name>" that holds provider <id>'s key isn't saved on this computer, so
  the sandboxed agent can't call its model. Save it in Settings › Models.*
- A provider with its own address (`baseUrl`), until HAL-13798 gives the agent host's bridge a way
  to reach it: *Studio can't send a sandboxed agent's calls to provider <id>'s own address
  (<baseUrl>) yet, so its key isn't used. Run this workflow with halonic run, or point the agent's
  model at a provider without its own address.* Liam asked for a plain refusal rather than a bare
  "refused" from the bridge; Studio stops before the key is read or the program starts.

