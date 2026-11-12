# Decision: the bridge passes a subscription sign-in on instead of refusing it

- Approval: HAL-3589 (build plan step B5 on HAL-194, approved by Liam on HAL-1961)
- Kind: internal

Until now, the bridge refused every request from an agent that signs in with
a subscription, with the kind `denied`, because passing the sign-in on was
planned for step B5. This is step B5.

What changes:

- A new requirement, `harness-bridge.sign-in`, says how the bridge passes the
  program's own `authorization` on to the provider's fixed host, unchanged,
  and records the call at a cost of 0, paid by the subscription.
- `harness-bridge.anthropic` and `harness-bridge.openai` no longer say the
  bridge refuses an agent that "doesn't use the provider with a key". They
  say it refuses an agent that doesn't use the provider at all, and point to
  `harness-bridge.sign-in` for an agent that signs in. Nothing else in them
  changes.
- The two route tests that expected a sign-in agent to get a 403 are
  removed. `sign-in.test.ts` replaces them with tests of what now happens.

Risk: a program with a subscription now reaches the provider through the
bridge. That is what B5 is for. The sign-in still goes only to the one fixed
host, and the bridge never keeps it.

## Covers

- harness-bridge.sign-in
- harness-bridge.anthropic
- harness-bridge.openai
