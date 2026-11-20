# kit.chat-start

- Status: active
- Since: 0.1.0
- Source: HAL-13177; states (HAL-5896) section 4, H1 and H2; flow-agents 4.1; microcopy 8.3; HAL-11705

The kit's `ChatStart` shall show what an empty chat shows before its first message, centred: its `figure`, hidden from screen readers, then its heading in `text-heading` at level 2 unless the feature sets another, then its `description` in `fg-muted` when it has one. It shall show no line for a missing or empty description and have no button of its own.

## Examples

- Given a ChatStart with the 64px orb, "Chat with Sorter" and "Sorts incoming mail by topic",
  when it renders,
  then the orb is hidden from screen readers, the level 2 heading reads "Chat with Sorter", and the description shows under it in `fg-muted`.
- Given a ChatStart with an empty description,
  when it renders,
  then it shows only the heading.
