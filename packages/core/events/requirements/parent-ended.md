# events.parent-ended

- Status: active
- Since: unreleased
- Source: HAL-12411 (R9 of Sofia's UX check on HAL-12390: the run page says a child run was cancelled because its parent ended; Liam's yes on HAL-12464 to a typed cause from the engine)

The events package shall give the typed cause of a child run that was cancelled because the run that started it ended: the kind `conflict` and the code `run.parent-ended`, with no `detail`, since the parent is the run's own `parent`. It shall tell whether a cause is that one, and say no for any other cause and for no cause, so a screen reading an older log keeps its plain cancelled note.

## Examples

- Given the cause of a child run cancelled with its parent,
  when it is read,
  then it is `{ kind: "conflict", code: "run.parent-ended" }` and it says the run ended with its parent.
- Given a cause with another code, a cause with only a kind, or no cause,
  when it is read,
  then it says the run didn't end with its parent.
