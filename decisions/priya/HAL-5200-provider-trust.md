# Decision: workspace trust covers model providers

- Approval: Liam approves this note in his review of this pull request on
  HAL-5200, a follow-up of the code review on HAL-5196
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:xsJhBuBm8TcbuBChx8wHP2kS3MHg6vc7Cb+hgHehMEug69qiyFi/3FMZHWY8K6uy3XI6PoedddB5gs8HKXSQCw==
- Task: HAL-5200

## What changes

`app.trust-service` builds the trust content with the workspace's model providers as well.
`cli.trust-check` shows each provider but the test model under Addresses, with its `baseUrl`
(or its type when the file names none) and the secret it gets, and counts it in the summary.
`cli.commands.trust.changes-json` lists `providers` next to `connectors`, `agents` and
`integrations`. The new `workspace.trust-providers` says what goes into the content for a
provider.

## Why

A provider's settings decide where a model call goes and which secret goes with it, as a
connector's URL and secret do. Trust already asks again when a connector's address changes, so a
provider's should too.

## What doesn't change

A workspace whose only provider is the test model keeps the same content and fingerprint, so
`init --example` and the trust skip of `run` work as before. Removing whole providers shrinks the
record without asking, as removing connectors does. No test is skipped or weakened: tests are
added, and one expected `changes` object gains the empty `providers` list.

## Covers

- app.trust-service
- cli.trust-check
- cli.commands.trust.changes-json
