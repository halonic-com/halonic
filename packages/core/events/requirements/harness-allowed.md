# events.harness-allowed

- Status: active
- Since: unreleased
- Source: HAL-14992, Owen's plan approved with changes by Liam (the audit event, Liam's final approval as a public-interface change)

The run log shall have a `harness.allowed` event for a call of an agent's program's own tool that Halonic let through without asking anyone, with the `agent`, the program's `tool`, a `detail` that holds the path the call read or edited, the command it ran (at most 2,000 characters) or `""`, and the `rule` that let it through, today only `asks-in-sandbox`. The event shall have no cost or token use and shall leave the run's waiting approvals as they are.

## Examples

- Given the event types of the run log,
  when they are listed,
  then `harness.allowed` is among them.
- Given a `harness.allowed` event,
  when its fields are listed,
  then it has `agent`, `tool`, `detail` and `rule`, and no `cost` or `usage`.
- Given a run summary,
  when a `harness.allowed` event is added,
  then its cost, use and waiting approvals don't change.
- Given a run log written before `harness.allowed` existed,
  when it is read,
  then it reads as before.
