# paperclip-client.route-timing

- Status: active
- Since: unreleased
- Source: the sync service design approved by the maintainer on HAL-19201 (PR 1, HAL-19333)

When the Paperclip transport is given a timing sink, it shall hand the sink one record per request it sends, with the request's method, its route template from the request list without `/api/`, the HTTP status (or `offline` when no answer came), the milliseconds from sending until the answer's body was read, and the number of body bytes read after `fetch` decompressed them. The record and its log line shall hold no ID, query string, header, key or body. Without a sink, the transport shall record nothing, read no clock and hand the body reader the answer exactly as `fetch` gave it.

## Examples

- Given a sink, when the transport reads task `<id>` with `?status=todo`,
  then the sink gets route `issues/:task` with status 200, its milliseconds and its bytes.
- Given that record, when it is turned into a log line,
  then the line holds neither the ID, the query string, any header nor the key.
- Given Paperclip can't be reached, when the transport sends a request,
  then the sink gets status `offline` and 0 bytes.
- Given a sink, when Paperclip answers with status 600,
  then the sink gets status 600 and 0 bytes, and the answer is a refusal with status 600.
