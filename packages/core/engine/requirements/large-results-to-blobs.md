# engine.large-results-to-blobs

- Status: active
- Since: 0.1.0
- Source: HAL-1533, step 4(d) of the HAL-186 plan ("Payloads over 256 KB"); the port ADR's "blob hash reference for payloads over 256 KB"

When a tool result is more than 256 KB (262,144 bytes) of UTF-8, the engine shall store the whole result in the blob store as `text/plain`, and shall write its `tool.result` event with the first 2,000 characters as `result` and the blob's hash, size and media type as `resultBlob`. A result of 256 KB or less, and every other event, shall be written to the run log as it is. When the blob can't be stored, the engine shall write no event for the result and the turn shall stop with that error.

## Examples

- Given a tool result of 300,000 characters,
  when its `tool.result` is logged,
  then the blob store holds the whole result, and the event has the first 2,000 characters and `resultBlob: { hash, size: 300000, mediaType: "text/plain" }`.
- Given a tool result of exactly 262,144 bytes,
  when its `tool.result` is logged,
  then the event holds the whole result and no `resultBlob`.
