# Decision: a failure detail entry is dropped when the secret filter changes its key

- Approval: Paperclip task HAL-11593 (Liam's review of halonic#3308); Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:OLzgssGbAByl55LN6KkMm0rHdxUt9yAhN/tS1MTKSgZyk6R3RUx6WlRhZpf5hLbJ1+740Sx7dxf0R9HHN18iAQ==

The runner bridge ran each `detail` value of a failure cause through the connector's secret filter but not its key, so a short key that the filter would change could still reach the run record. The bridge now drops an entry when the filter changes its key or its value.

- Entries are dropped whole, never kept half-masked.
- Keys in our own integrations are fixed names, so no legitimate entry is lost.

## Covers

- integration-runner.failure-cause
