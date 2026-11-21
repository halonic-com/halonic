# kit.chat-message

- Status: active
- Since: unreleased
- Source: HAL-13177; flow-agents 4.2 and 4.4; microcopy 19.5 (each reply's hidden heading); HAL-11705

The kit's `ChatMessage` shall show a message the person sent on the right, in a `surface-muted` box, and a reply across the column under a heading that only screen readers get, such as "Sorter said", at level 3 unless the feature sets another. A reply shall show its steps in the order given. The kit's `ChatText` shall show one text step in `text-reading`. Both shall keep the text's line breaks and wrap a long word rather than cut it.

## Examples

- Given a ChatMessage from "you" with "Sort this mail",
  when it renders,
  then the text shows in a box at the right.
- Given a ChatMessage from "reply" with the heading "Sorter said" and a text step,
  when it renders,
  then a visually hidden level 3 heading "Sorter said" comes before the text.
