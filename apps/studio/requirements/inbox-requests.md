# studio.inbox-requests

- Status: active
- Since: 0.2.0
- Source: HAL-1305; inbox.request

The Studio shall offer the Inbox's request form every workflow of the open workspace that has a `start:` block, by its `start.label`, with the workflow's description for the placeholder, and a request shall start that workflow through the engine with the message as the input named by `start.field`. When the window has no engine to start a run, no workflow shall be offered.

## Examples

- Given the Acme workflow "Support reply" with `start: { label: Answer a customer's email, field: mail }`,
  when the Inbox asks what is offered,
  then it gets "Answer a customer's email" with the workflow's description.
- Given that workflow,
  when a request sends "Hi, my order arrived damaged.",
  then a run of "Support reply" starts with the input `{ mail: "Hi, my order arrived damaged." }`.
- Given a workflow with no `start:` block,
  when the Inbox asks what is offered,
  then it isn't there.
- Given a window with no engine,
  when the Inbox asks what is offered,
  then nothing is.
