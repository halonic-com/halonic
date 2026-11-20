# studio.inbox-request-trigger

- Status: active
- Since: unreleased
- Source: HAL-12727 (L5, D3), from the first-run check HAL-12714 (F11)

When the Inbox's request form starts a workflow, the run shall record an `inbox` trigger with the time it started, and no routine, so the Studio can say the person started it in the Inbox. A run started with Run shall keep its `manual` trigger.

## Examples

- Given the Acme workflow "Support reply" offered as "Answer a customer's email",
  when a request sends "Hi, my order arrived damaged." at 10:00,
  then the engine starts the run with the trigger `{ type: "inbox", at: "…T10:00:00.000Z" }`.
- Given that workflow,
  when the person starts it with Run at 10:00,
  then the run's trigger is `{ type: "manual", at: "…T10:00:00.000Z" }`.
