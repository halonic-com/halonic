# model-anthropic.server-sent-events

- Status: active
- Since: 0.1.0
- Source: HAL-2921; the WHATWG HTML standard's event stream format

The Anthropic provider shall read a streamed reply as server-sent events: lines ending in `\n`, `\r\n` or `\r`, `event:` and `data:` fields, several data lines joined with `\n`, comments skipped, and an event dispatched at a blank line, however the bytes are split into chunks. An event cut off at the end of the body shall be dropped. When reading stops early, it shall cancel the body.

## Examples

- Given a `\r\n` split between two chunks,
  when the events are read,
  then no empty event comes between them.
