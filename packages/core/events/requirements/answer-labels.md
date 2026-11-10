# events.answer-labels

- Status: active
- Since: 0.1.0
- Source: Liam's architecture decision on HAL-4014 (for the Inbox answer labels, HAL-4008)

The events package shall let a `run.waiting` event carry, as an optional `labels`, the label the wait step's author gave each answer (event → label, only the events that have one), so every place that shows a waiting run's answers uses the author's word. While the run waits, its summary shall hold them in `answerLabels`, and `{}` when the event has none. When the run goes on, `answerLabels` shall be `{}` again. Logs written before the field existed read as before.

## Examples

- Given `run.waiting` with `approve` and `reject` and the labels `approve: "Send reply"`,
  when it is summarized,
  then `answerLabels` is `{ approve: "Send reply" }`.
- Given `run.waiting` without labels,
  when it is summarized,
  then `answerLabels` is `{}`.
- Given `run.waiting` with labels followed by `event.received`,
  when they are summarized,
  then `answerLabels` is `{}`.
