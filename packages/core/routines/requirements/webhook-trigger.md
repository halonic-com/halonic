# routines.webhook-trigger

- Status: active
- Since: 0.1.0
- Source: HAL-195 (plan D22, webhook triggers for routines)

The routines package shall treat a `webhook` trigger as a kind of its own that never fires on a clock: `triggerKind` names it `webhook`, `describeTrigger` writes it as "On a signed web request" (never naming the secret), `nextRun` gives null, `triggerError` gives null, and the tick finds it never due. A request from outside starts it, and that is the host's job.

## Examples

- Given a webhook trigger, when its kind is asked, then it is `webhook`.
- Given a webhook trigger, when it is described, then it reads `On a signed web request`.
- Given a webhook trigger, when the next run is asked, then it is null.
