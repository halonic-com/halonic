# routines.trigger-values

- Status: active
- Since: unreleased
- Source: HAL-14298 (C340 C30 (b) and (c), Nina's check on HAL-14271, rows 10 and 11; decided by Liam on the task)

The routines package shall take `{{trigger.at}}` and `{{trigger.lastRun}}` as values of every routine's trigger, and also `{{trigger.message}}` and what is under it for a mail trigger, `{{trigger.body}}` and what is under it and `{{trigger.headers.<name>}}` for each header it lists for a webhook trigger, and `{{trigger.signal}}` and what is under it for a signal trigger. For each placeholder in a text of a routine's workflow input, or in its agent prompt, that isn't one of its trigger's values, the routines package shall give the place and a message that names the placeholder and the values to use: `{{trigger.<x>}} isn't a trigger value. Use {{trigger.at}} or {{trigger.lastRun}}.`, or for a value of another trigger `{{trigger.<x>}} is only set for a routine on <that trigger>.`, or for a header the webhook doesn't list that it isn't a header the webhook passes on. If a routine with such a placeholder starts, then the routines package shall start nothing and fail with the first of these messages, so a run never starts with an empty text or without the input key.

## Examples

- Given a schedule routine whose input is `{ day: "{{trigger.date}}" }`, when it is checked, then it gives `{{trigger.date}} isn't a trigger value. Use {{trigger.at}} or {{trigger.lastRun}}.` at `run.input.day`, and when it starts, it fails with that message.
- Given a schedule routine whose input uses `{{trigger.body}}`, when it is checked, then it gives `{{trigger.body}} is only set for a routine on a webhook.`
- Given a webhook routine that lists the header `x-event`, when its input uses `{{trigger.headers.x-event}}` and `{{trigger.body.id}}`, then there is nothing to report, and `{{trigger.headers.x-id}}` is reported.
