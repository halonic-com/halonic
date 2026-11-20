# routines.signals-due

- Status: active
- Since: 0.1.0
- Source: new (HAL-14305); before it, nothing started a routine on a signal

When asked which routines a tick's signals start, the routines package shall return, for each enabled routine with a `signal` trigger, every signal of the same name that a run sent after the last tick less two minutes, up to and including now, and that passes the trigger's `when`. `when` reads the signal's data as `trigger.signal` and the time it was sent as `trigger.at`, as the routine's input and prompt do. The signals of every run count, a `workflow` step's child run included: a signal belongs to the step that sent it, whichever run the step ran in. A signal older than the catch-up window (7 days by default, `maxCatchUpAgeMs`) is dropped, as a missed time is. `catchUp` doesn't apply to signals. Each start names the signal and the run that sent it, so the caller can give it a run id of its own and follow it back. With no last tick, or when now is not after it, nothing is due. Starts come oldest first, ties by key, then by signal id.

## Examples

- Given a routine on signal `invoice.paid` and a run that sent `invoice.paid` at 10:00:30, a last tick at 10:00 and now 10:01, when the tick runs, then one start is due at 10:00:30, naming the signal and the run.
- Given the same routine and a signal named `invoice.sent`, when the tick runs, then nothing is due.
- Given `when: { exists: "{{trigger.signal.vendor}}" }`, a signal with data `{ vendor: "Acme" }` and one with `{}`, when the tick runs, then only the first starts the routine.
- Given a signal sent by a `workflow` step's child run, when the tick runs, then it starts the routine as a top-level run's signal does.
- Given a signal sent at 09:58:30, a last tick at 10:00 and now 10:01, when the tick runs, then it is due again (it may have been appended while the last tick read the runs); one sent at 09:57:59 is not.
- Given a last tick 9 days ago, when the tick runs, then a signal sent 8 days ago is dropped and one sent 6 days ago is due.
- Given a routine with `enabled: false`, or a routine on a schedule, when the tick runs, then no signal starts it.
- Given a last tick of null, when the tick runs, then nothing is due.
