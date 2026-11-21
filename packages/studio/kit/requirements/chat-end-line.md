# kit.chat-end-line

- Status: active
- Since: unreleased
- Source: HAL-13177; states (HAL-5896) section 4, H13, H22 to H24, H26; microcopy 8.3 and 14.1; HAL-11705

The kit's `ChatEndLine` shall show the line that ends a reply: its whole sentence, wrapped and never shortened, in `danger` with the alert mark first for a failure, or in `fg-muted` without a mark for a reply that ended another way. Under the sentence it shall show the line's actions in the order given: an action that does something here as a `secondary` `sm` button, and a way to another place as an inline link. A line without actions shall show no action row. It shall not be a live region.

## Examples

- Given a `danger` ChatEndLine "Sorter's reply failed: Anthropic was busy." with Try again,
  when the person clicks Try again,
  then its `onClick` is called once.
- Given a `plain` ChatEndLine "Some tool calls already ran. Send a new message to continue." with no actions,
  when it renders,
  then it shows the sentence and no button or link.
- Given a ChatEndLine with Try again and the link "Open Models ›",
  when it renders,
  then Try again is a button and Open Models › an inline link, in that order.
