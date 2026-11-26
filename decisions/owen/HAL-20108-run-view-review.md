# Decision: the run view's review findings tighten `events.run-view`

- Approval: Paperclip task HAL-20108; Liam's review of #6679 asked for these changes
- Kind: internal

Liam's review of the run view (#6679) found three places where the view could show more than it should. This change narrows each of them:

- A filled `{name}` placeholder of an approval text is cut at 200 characters.
- A received event shows only when it answers an event the run waits for. Before, a webhook's or a signal's event read as the end user's answer.
- The view names the plan limit only while the run waits at it.

Each change only shows less. One expectation of the every-kind test changes for this reason: its chat message comes after a timer fired, when the run no longer waits for it, so it no longer shows. Nothing shows the run view to users yet.

## Covers

- events.run-view
