# workflow.state-timers

- Status: active
- Since: 0.1.0
- Source: `stateTimers` and `dueTimer` in the old workflow package (`packages/core/workflow/src/machine.ts`) at 784f78d

When a state with `after` transitions is entered, the workflow rules shall start one timer for each of them, due that long after the state was entered. When asked which timer to take at a moment, the rules shall take, of the timers due by then, the one due first whose guard passes, with file order breaking ties, and none when no due timer's guard passes.

## Examples

- Given transitions `after: 1h`, `after: 1h` and `after: 2d` and the state entered at 08:00, when the timers start, then they are due at 09:00, 09:00 and 08:00 two days later.
- Given it is 08:59:59, when a timer is asked for, then none is due.
- Given both `1h` timers are due and the first has a guard that fails, when a timer is asked for, then the second is taken.
