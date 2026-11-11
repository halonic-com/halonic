# app.routine-versions

- Status: active
- Since: 0.1.0
- Source: engine answer point 4 (HAL-3267); flow-routines rev 20, 3.4–3.7 ("Your new schedule … isn't live yet"); stub `app.routines.get-live-and-saved` in req-core-routines (HAL-3246)

When the routine page asks for a routine by its file's path, `routineVersions` shall return `{ live, saved, savedProblems, liveState }`: the routine as the live version has it, or none when it has never been live; the saved routine, or none when its saved file isn't there or doesn't parse; the problems of a saved file that doesn't parse; and its live state (`app.live-state`), all read from one live version. With history off, `live` shall be the saved routine, since that is what runs.

## Examples

- Given routine "morning" live at 10:42 with `0 8 * * *` and saved with `0 7 * * *`, then `live` has 08:00, `saved` has 07:00, and `liveState` is `not-live` since 10:42.
- Given "morning" saved without the workflow or agent it starts, so it doesn't parse, and live at 10:42, then `live` is the 10:42 routine, `saved` is none, `savedProblems` names the problem, and `liveState` is `not-live` since 10:42.
- Given "morning" never in a version, then `live` is none and `liveState` is `never-versioned`.
- Given "morning" that differs from its live version only in `enabled`, then `live` and `saved` each have their own `enabled`, and `liveState` is `live`.
- Given a workspace with history off, then `live` is the saved routine and `liveState` is `live`.
- Given "morning" live but its saved file gone, then `saved` is none with no problems, and `liveState` is `not-live`.
