# Decision: the served Inbox names the wait step it answers

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13830 (OH1 from the C415 check, decided by the team)
- Kind: internal

## What changes

- `studio.served-inbox-runs`: an answer to a wait step also sends `wait`, the step's state and the
  time it started waiting, next to the event, its payload and a tool call's `callId`. The host
  (`server.run-routes`) already checks a `wait` it gets.
- `cli.commands.serve.agent-names`: only the rationale changes. It said a rename shows "at once";
  the names come from the live version, so a rename saved in an agent file shows once a new live
  version holds it (NM1 from the C422 check). The requirement and its examples stay as they are.

## Why

The desktop's answer names its wait step, so a late answer is refused and the card says "This is no
longer waiting for you." The served page dropped `wait`, so a card left open on a phone, whose step
was answered elsewhere, could answer the run's next wait step. The new sentence and example only add
to the requirement; no example or test was changed or removed.

## Covers

- cli.commands.serve.agent-names
- studio.served-inbox-runs
