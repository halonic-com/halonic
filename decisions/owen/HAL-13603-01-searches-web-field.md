# Decision: a provider file may list the models that search the web by themselves

- Task: HAL-13603
- Approval: HAL-13604 (Liam approved the plan: an optional `searchesWeb` list in the provider file); Liam signs this note in review on HAL-13603
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:DNValwODYBqgehZW+X1oCl0kk7l7RxpS1UrkFUKWIyxeowiphYc4WmkgNYgmsZCuFSi6m9+v7D/wWGfqZ3YlAg==

## What changes

`format.provider-searches-web`: a provider file accepts an optional `searchesWeb`, a list of the
model ids at that provider that search the web by themselves. The published
`provider.schema.json` golden gains that one optional property. No existing property changes, and
a file without `searchesWeb` reads as before.

## Why

A harness agent's model calls go through the bridge's allow-list, but a model that searches the
web by itself does so at the provider, outside Halonic's tools and approvals. `halonic doctor`
(the next pull request on HAL-13603) warns about an alias that points at such a model, and needs
this list to know which ones do.

No test was weakened or removed.

## Covers

- packages/core/format/spec/provider.schema.json
