# app.scheduler-starts-signal-routines

- Status: draft
- Since: unreleased
- Source: plan on HAL-14305 (Liam's approval and points 1–5, 20 Nov); Julian's conditions on HAL-14332; before it, a routine on a signal never started

When the routine scheduler of a workspace ticks, it shall, after the due times, start the enabled routines on a signal for the signals the workspace's runs sent, as `routines.signals-due` matches them, reading the runs started in the catch-up window (7 days by default). The scheduler's run store shall hold only its own workspace's runs. Each start shall get a run id made from the workspace, the routine key and the signal's id (`signalRunId`), and the trigger `{ type: "signal", routineId, at, signalId }`, with `at` the time the signal was sent, and shall fill in `{{trigger.signal}}` with the signal's data, so a signal that two ticks or two hosts see starts the routine once. Before the overlap rule, it shall ask the loop guard (`routines.signal-loop`), and when the guard refuses, or reading the store for it fails, the start shall not happen and shall be added to the routine's skip records with the reason `signal-loop`. Then the routine's `overlap` shall count every run of the routine that is running or waiting, whatever started it: with `skip`, at most one of the routine's signals starts per tick and the others are `busy` skips; with `queue`, they are kept, at most 100 per routine, and start on a later tick once the routine is free, if the routine still starts on that signal; with `allow`, each starts. A skipped signal shall not be decided again by a later tick. A routine renamed while a signal is in the window may start once more for that signal under its new name; older signals don't start it again. A start that fails shall be reported and recorded as a refused start, as for a due time (`app.scheduler-keeps-refused-starts`).

## Examples

- Given a routine `billing/thanks` on `invoice.paid` with the input `vendor: "{{trigger.signal.vendor}}"`, a last tick at 10:00 and a run that sent `invoice.paid` with `{ vendor: "Acme" }` at 10:00:30, when the 10:01 tick runs, then it starts `thank` with `vendor: "Acme"` and the signal trigger.
- Given that signal, when a second host ticks at 10:01:30 and the first again at 10:02, then nothing more starts.
- Given a run of `billing/thanks` that sends the signal it starts on, when the tick runs, then nothing starts and the routine has a `signal-loop` row.
- Given a store whose reads fail while the guard follows the chain, when the tick runs, then nothing starts and the routine has a `signal-loop` row.
- Given a routine with `overlap: skip` and one run that sent 5 signals, when the tick runs, then one run starts and 4 times are `busy` skips; the next tick starts none of them.
- Given a routine with `overlap: queue` and one run that sent 2 signals, when the tick runs, then one starts and one is queued; once the first run ends, a later tick starts the queued one with its own data.
- Given signals sent at 10:01 and 10:04:30 that started `thanks` on the 10:05 tick, when the routine is renamed and the 10:06 tick runs, then only the 10:04:30 signal starts it again.
