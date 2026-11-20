# kit.chat-tool-line

- Status: active
- Since: unreleased
- Source: HAL-13177; flow-agents 4.4 (tool use shows as one quiet line); HAL-11705

The kit's `ChatToolLine` shall show one tool call of a reply as one quiet line: a 16px mark hidden from screen readers, then the feature's words in `text-small` `fg-muted`. The mark shall be the busy spinner while the call runs, a tick when it's done, and the alert mark in `danger` when it failed. It shall not be a live region.

## Examples

- Given a ChatToolLine in state "running" with "Searching pages…",
  when it renders,
  then it shows the spinner and the words, and the spinner is hidden from screen readers.
- Given a ChatToolLine in state "failed",
  when it renders,
  then its mark is the alert mark in `danger`.
