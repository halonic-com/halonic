# routines.signal-loop

- Status: active
- Since: unreleased
- Source: new (HAL-14305); before it, no routine started on a signal; fails closed as Julian asked on HAL-14332

When asked whether a signal may start a routine, the routines package shall refuse two kinds of loop, and allow every other start. **Itself:** a signal sent by a run that the routine itself started never starts that routine again; a run started by a `workflow` step counts as the top-level run above it. **Chain:** following each signal start back from the run that sent the signal to the run whose signal started it, a chain of up to 4 signal starts may run, and the start that would be the fifth is refused, whichever routines take part, two routines that start each other included. The guard fails closed: when a run on the way back is no longer in the store, or a signal start doesn't name the signal that started it, it refuses with `unknown`, and when reading the store fails, it rejects, so the caller refuses the start too. A run met twice on the way back is refused as a chain. The guard reads one run per step, and never more runs than the chain has.

## Examples

- Given a scheduled run of routine X that sends the signal X starts on, when the guard is asked about X, then it refuses with `itself`.
- Given the same signal sent by a child run of X's run, when the guard is asked about X, then it refuses with `itself`.
- Given a run of routine Y that sends the signal X starts on, when the guard is asked about X, then the start may go ahead.
- Given a scheduled run of A whose signal starts B, whose signal starts A, when the guard is asked about B again, then the start may go ahead (a chain of 3).
- Given a chain of 4 signal-started runs, when the last one's signal would start a fifth, then the guard refuses with `chain` and length 5; one link shorter, the start may go ahead.
- Given a signal whose sending run, or a run further back on its chain, is no longer in the store, when the guard is asked, then it refuses with `unknown`.
- Given a signal-started run on the chain whose trigger has no `signalId`, when the guard is asked, then it refuses with `unknown`.
- Given a store whose read fails, when the guard is asked, then it rejects with that error.
- Given two runs whose signals name each other as their start, when the guard is asked, then it refuses with `chain`.
