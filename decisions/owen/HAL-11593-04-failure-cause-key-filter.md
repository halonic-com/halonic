# Decision: a failure detail entry is dropped when the secret filter changes its key

- Approval: Paperclip task HAL-11593 (Liam's review of halonic#3308); Liam approves this note in review
- Kind: internal

The runner bridge ran each `detail` value of a failure cause through the connector's secret filter but not its key, so a short key that the filter would change could still reach the run record. The bridge now drops an entry when the filter changes its key or its value.

- Entries are dropped whole, never kept half-masked.
- Keys in our own integrations are fixed names, so no legitimate entry is lost.

## Covers

- integration-runner.failure-cause
