# Decision: a local-only workspace says to add a missing plugin first, not to turn off local-only

- Approval: the task HAL-15806 asks for this change, from flow check C634 #2 (HAL-15803). The team decides it under the HAL-2282 rule, since it rewords a message that is already there. Liam signs this note in review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:8I7cl0F6udqmezosmdaqT633ADT8siiJJGoSKtaRg0PpVJCiny2ubnn0z1aKzY1H7eWNaQtFhSkg2QoUXQ7xDA==

## What changes

- `workspace.local-only-sheet-hosts`: in a local-only workspace, a `plugin` connector whose plugin isn't among the hosts given (it isn't added on this computer, or it can't be read) still gets the `local-only-connector` error, but the message ends with "add the plugin first, then Halonic can tell whether it's local" instead of "set privacy.localOnly: false in workspace.yaml to use it". It also says "isn't added here" instead of "isn't installed here", the word `halonic validate`'s `plugin-not-added` warning and `doctor`'s Plugins line use. The requirement's text says so, and the example for a plugin that isn't added changes to the new message. A connector to an integration whose sheet can't be read, and a plugin whose hosts are known, keep their messages. Which connectors count as local, and what `halonic run` refuses, don't change.

## Why

C634 #2: for one plugin that isn't added, `validate` gave two fixes, and the first one, an error, was to turn off local-only, which weakens privacy for a plugin nobody has looked at yet. The warning after it said to add the plugin. Once the plugin is added, the error names its hosts, and turning off local-only is then a fair choice to offer. The error stays, rather than going quiet, so `validate` and `run` still refuse the same connectors.

## Tests

No test was weakened or skipped. In `local-only.test.ts`, the test of sheets it wasn't given expects the new plugin message; the integration's message in the same test is unchanged.

## Covers

- workspace.local-only-sheet-hosts
