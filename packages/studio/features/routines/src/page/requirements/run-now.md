# routines.page.run-now

- Status: draft
- Since: unreleased
- Source: HAL-1306 (T12 PR 13); flow-routines 3.8; microcopy 12.3

Where the host can start a run, the routine page shall show **Run now** in its header, also while the routine is off; pressing it shall start the routine's target at once and say what happened with a toast, and when no run starts, the toast shall stay and say the one reason.

## Examples

- Given the host has no engine, then the page shows no **Run now**.
- Given the host starts run "run_1" ending in "abc123", when **Run now** is pressed on "Daily", then a toast says "Run started · Daily · Run abc123" with **Open run**, and **Open run** opens that run.
- Given the routine is off, then **Run now** is still there and starts the run.
- Given the host refuses because the target isn't live yet, then a toast that stays says "Not started: Briefing isn't live yet."
- Given the host refuses because the account is signed out, then a toast that stays says "Not started: fin@acme.example is signed out."
- Given the engine isn't answering, then a toast that stays says "Couldn't start Daily." with the reason.
