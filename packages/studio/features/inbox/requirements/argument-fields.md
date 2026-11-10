# inbox.argument-fields

- Status: active
- Since: 0.1.0
- Source: HAL-1218; [card requirements](/HAL/issues/HAL-64#document-requirements) INBOX-CARD-01 and 05; [ux-checklists-approvals](/HAL/issues/HAL-1250#document-ux-checklists-approvals) 2.1

The approval card shall show every argument the agent sent as a readable `name: value` field, in the order sent, whatever the tool. An empty string, `{}` and `[]` read "(empty)"; `null` reads "(none)". Nested objects and lists are indented one level per depth, and a list's items are named by their position from 1. Arguments that aren't an object show as one field named `arguments`. The exact arguments shall be one click away as raw JSON.

To keep the card responsive, it shows 5 levels and 200 fields. A deeper value shows only its size ("3 fields in the raw JSON"), and fields past 200 say how many are left ("12 more fields in the raw JSON").

## Examples

- Given `{ title: "Refund for Sam", body: "", tag: null }`,
  when the card shows the arguments,
  then it reads `title: Refund for Sam`, `body: (empty)`, `tag: (none)`.
- Given `{ note: { labels: ["refund", "sam"] } }`,
  when the card shows the arguments,
  then `note` (1 field) holds `labels` (2 items), which holds `1: refund` and `2: sam`, each a level deeper.
- Given 250 top-level arguments,
  when the card shows them,
  then 200 show and a last line says "50 more fields in the raw JSON".
