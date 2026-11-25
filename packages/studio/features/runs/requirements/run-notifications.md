# runs.run-notifications

- Status: active
- Since: unreleased
- Source: HAL-18624 (Runs app build), design revision 3 on HAL-18594 (Runs: Notifications), approved by the board on 25 Nov 14:48 UTC; task HAL-18776

When a run of any source fails, or finishes after the user started it, the Studio shall show one desktop notification, through the notification service and its quiet hours, in the design's words: "Nightly report failed" with "Acme Ops · in the step Fetch sales" for a workflow, "Ada's run stopped with an error" with "Paperclip · Acme · HAL-18533" for an agent, and "Weekly digest finished" with "Acme Ops · took 4 min · €0.02" for a finished run. A click shall open Runs on that run. Failures in the minute after a shown failure shall wait and then show as one notification, "3 runs failed" with the places they ran, whose click opens Runs on the Failed group; a single held failure shall show as its own. The three switches "When a run fails" (on), "When a run I started finishes" (on) and "When any run finishes" (off) shall decide which runs notify. A stopped run, a run already ended when the watch started, and a run that only shows up now but started before the last reading shall show nothing.

## Examples

- Given the defaults, when a workflow run the schedule started finishes,
  then nothing shows; when "When any run finishes" is on, "Weekly digest finished" shows.
- Given a failure shown at 14:00:00, when two more runs fail at 14:00:20,
  then one notification "2 runs failed" shows at 14:01:00.
