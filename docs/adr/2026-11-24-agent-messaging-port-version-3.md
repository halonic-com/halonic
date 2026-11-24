# The AgentMessaging port is at version 3: action items and the `action-result` answer

- **Status:** Proposed
- **Date:** 2026-11-24

## Context

The [action sender ADR](2026-11-24-action-sender.md) decided that a request
to run a user-only action stepper reaches the Inbox through `AgentMessaging`,
in its next version, and that Studio answers it with the folded result. That
answer goes into the requesting agent's context and the run log, so it must
not carry the account the user signed in with, a token or a whole answer
body. Versions 1 and 2 have neither the item nor the answer: an item offers
options and takes an option or a reply. Version 2 added attachments (the
[agent messaging ADR](2026-11-24-agent-messaging.md)).

## Decision

`agentMessagingVersion` is 3 (`ports.agent-messaging-actions`).

- **An action item** is an `InboxItem` with `action`: the definition, its
  version, the parameters, the optional `expect` and the expiry. It never
  holds a step, a method, an address, a header or a body. It offers no
  options, and its `question` is the requester's reason, shown quoted. We add
  an optional field rather than turning `InboxItem` into a union, so an item
  of version 2 is still a valid item of version 3 and the Inbox's open pull
  requests keep compiling.
- **`InboxAnswer` gets an `action-result` variant**: how the request ended
  (`succeeded`, `failed`, `declined`, `expired`) and, for each step the
  stepper reached, its outcome (`succeeded`, `failed`, `skipped`), the HTTP
  status, the kept fields for a success, and for a failure why and the
  service's error text. The text is at most 300 characters and wrapped as
  `{ untrusted: true, text }`, so the marker travels with it into the agent's
  context. There is no account field.
- **`checkActionResultAnswer`** checks an answer against that allow-list, as
  `checkActionEvent` does for the action events: kept fields are plain values
  under plain names, and `kept`, `failure` and `error` appear only on the
  outcome they belong to. A problem names the field, never its value.
- **`answerFitsItem`**: an action item takes only an `action-result` that
  passes the check, any other item only an option or a reply. Every
  `AgentMessaging` refuses an answer that doesn't fit with the new refusal
  `bad-answer`, before sending anything.

The breaking part: code that handles every `InboxAnswer` or every
`MessagingRefusal` has a new case, and an Inbox built for version 2 would show
an action item as a question with no options.

## Consequences

- `FakeAgentMessaging` adds action items (`addInboxItem` with `action`) and
  answers them once with `action-result`, refusing answers that don't fit
  (`contracts.fake-agent-messaging-actions`). The stepper and the Inbox change
  build against it.
- The Paperclip provider turns a card with a pinned `stepper-request` into an
  action item and posts an `action-result` answer as one comment, in its own
  pull request. Until then it serves no action items.
- The Inbox shows an `action-result` answer by its outcome until its own
  change shows action items and opens the stepper.
- If the requesting run has ended, the engine records the answer as a run
  event carrying the request id (action sender ADR), checked with
  `checkActionResultAnswer` again.
- Phase 2's channels (the agent messaging ADR) become version 4.
