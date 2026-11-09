# parity.runner-records-cli-output

- Status: active
- Since: 0.1.0
- Source: HAL-1891

When the recorder records the base, the old runner shall also run the old CLI's `studio test` and `studio run` calls listed in `src/cli-calls.ts` on the base, and the recorder shall write `cli.json` next to the base's `recorded.json`. For each call it holds the arguments, the exit code, stdout and stderr, every run the call stored with all its events in order, and every file the call wrote under `.studio`.

Each call shall run in its own process, on a fresh copy of the workspace that is deleted after, with the copy's folder written as `<workspace>`. The process's clock shall stand still at 2026-01-01T00:00:00Z (`Date.now`, `new Date()` and `Date()`), and its random source (`crypto.getRandomValues`, `crypto.randomUUID`, `Math.random`) shall count up from 1. The recorder shall rename the IDs the old CLI made from them to `<prefix>_<n>`, counted per prefix in the order they were made, starting again for each call.

The runner shall run each call twice. If the two differ, then it shall stop and name the call. If the recording still carries a random old run ID, or a time more than 30 days from the fixed clock, then the recorder shall refuse to write it.

## Examples

- Given `studio run <workspace> billing approval --event approve`, then the call prints `Run run_1: completed`, stores the run `run_1`, and every event is at 2026-01-01T00:00:00Z.
- Given a run that starts a nested workflow, then its runs are `run_1` (its own) and `run_2` (the nested one).
- Given a call whose output reads a timer that isn't fixed, then recording stops and names that call.
- Given a recording that holds `run_mw6zmn5u_8202b972` or 2026-11-09T15:07:34Z, then recording fails.
- Given a case (not the base), then no `cli.json` is written for it.
