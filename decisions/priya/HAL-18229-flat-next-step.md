# Decision: set_next_step and finish_run take flat parameters

- Approval: HAL-18229 (the task asks for this change and its requirement example)
- Kind: internal

`runtime.paperclip-writes` gets one more example: a `set_next_step` tool file whose
parameters are plain values. The runtime now also reads the monitor from
`monitorInMinutes`, `monitorRef`, `monitorService` and `monitorMaxChecks`, and `blockedBy`
as one text with commas between the tasks, with the same limits and refusals. The
requirement's text and its other examples don't change, and no test is weakened: the
existing tests for the `monitor` object and the `blockedBy` list still pass as they were.
Two expectations grow to match: the `blockedBy` refusal also shows the text form, and
`paperclip.next-step` declares the four flat `monitor…` parameters
(`format.tool-action-parameters`), so a tool file may use them.

## Why

A tool file's parameters can only be plain values (`format.tool-file`), so `set_next_step`
could never be called through one, and neither could `finish_run` with outcome `blocked`.
The object and list forms stay, for callers that already use them.

## Covers

- runtime.paperclip-writes
