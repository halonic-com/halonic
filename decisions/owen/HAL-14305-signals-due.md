# Decision: routines learn which signals start them

- Approval: Paperclip task HAL-14305, on the plan Liam approved there (20 Nov) and his re-plan on HAL-14309; he approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:8GYoYHdbZ5iRA00Vl6mciS9F0/BmzgbL+ISc6iLsWR7PsAXuTrndXqN6IXHBqMQxp5o3k2fqgLAAkY0O6tCgBQ==

## What changes

A routine on a signal never started: nothing read the trigger. This pull request adds the
matching, as the new requirement `routines.signals-due`, and two small edits to active ones:

- `routines.due` still says signal triggers are never due there, and now points to
  `routines.signals-due`, where they are. Nothing in `due` changes.
- `routines.routine-start` also fills in `{{trigger.signal}}` with the signal's data, as the
  example routine in the parity fixtures already expects (`{{trigger.signal.vendor}}`). Nothing
  that was filled in before changes.

Nothing calls `signalsDue` yet, so no routine starts on a signal with this pull request alone.
The start in the scheduler tick, and the loop guard it uses, come in later pull requests on
HAL-14305.

## Covers

- routines.due
- routines.routine-start
