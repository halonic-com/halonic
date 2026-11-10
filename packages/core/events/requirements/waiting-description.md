# events.waiting-description

- Status: active
- Since: 0.1.0
- Source: Liam's architecture decision on HAL-1218 (from the halonic#741 review, HAL-2560): a wait step's description is a template, filled in once by core

The events package shall let a `run.waiting` event carry the wait step's description, filled in against the run when it started waiting, as an optional `title` (its first line) and `body` (the rest), so every place that shows a waiting run reads the same text. While the run waits, its summary shall hold them in `waitingFor`, and `null` when the event has neither. When the run goes on, `waitingFor` shall be `null` again. Logs written before the fields existed read as before.

## Examples

- Given `run.waiting` with the title "Approve this reply?" and the body "Hello Ada",
  when it is summarized,
  then `waitingFor` holds that title and body.
- Given `run.waiting` with a title and no body,
  when it is summarized,
  then `waitingFor` holds the title and an empty body.
- Given `run.waiting` without a title or a body,
  when it is summarized,
  then `waitingFor` is `null`.
- Given `run.waiting` with a title followed by `event.received`,
  when they are summarized,
  then `waitingFor` is `null`.
