# app.scheduler-target-unavailable-live

- Status: active
- Since: 0.1.0
- Source: engine answer point 4, the seventh skip reason (HAL-3267); flow-routines rev 20, 2.4 and 3.9; HAL-3246 step 4b-2

`LiveRoutines.targetUnavailable` shall answer the routine scheduler's `targetUnavailable` check (`app.scheduler-skip-target-unavailable`) from the live version and the saved files: `never-live` when the routine's target, the workflow or agent it starts in the hub it names or its own, isn't in the live version but is saved; `in-trash` when the target is in the live version but no saved file is at its path; otherwise `null`, so the run starts. A target that is neither live nor saved, such as a misspelt id, shall give `null`, so the run fails on its own as before. With history off, or with nothing live yet, it shall give `null`.

## Examples

- Given routine "morning", live, that starts workflow "digest", and "digest" saved but in no version, then `targetUnavailable` gives `never-live`, and a tick that would start 08:00 records a `target-unavailable`, `never-live` skip and starts nothing.
- Given "digest" live and its saved file moved to the trash, then it gives `in-trash`.
- Given "digest" live and saved, then it gives `null` and the run starts.
- Given a routine that starts agent "clerk" in hub "support", with "clerk" live only in hub "sales", and saved in "support", then it gives `never-live`.
- Given a routine that starts workflow "digets", which is neither live nor saved, then it gives `null`.
- Given a workspace with history off, then it gives `null`.
