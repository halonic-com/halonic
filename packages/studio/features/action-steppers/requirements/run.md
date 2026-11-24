# action-steppers.run

- Status: active
- Since: unreleased
- Source: HAL-17527 (approvals stream HAL-17488, PR 8); architecture note on HAL-17491, sections 1.3, 2.3 and 2.4; the board's decision on HAL-10 (24 Nov) that the screens follow the approved Inbox look, and section 6 (resume, irreversible steps)

The stepper shall run one step per press, **Run step 2 of 3** for the next step still to do, and show under each step how it went: "Done already" for a step a check showed was done, and for a failure the status and the service's own message, after which the button reads **Try step 2 again**. Before an `irreversible` step runs, the stepper shall ask for an extra confirmation, and shall run nothing when it is cancelled. The stepper shall offer **Run all steps** only when every step is `routine`. While a step runs, no button shall start anything else.

## Examples

- Given step 2 of 3 failed with status 403,
  when the request shows,
  then step 2 says "Failed with status 403. GitHub said: “Resource not accessible by integration”" and the button reads **Try step 2 again**.
- Given a release approval whose step 2 is irreversible,
  when the user presses **Run step 2 of 2**,
  then a dialog asks "Run step 2? It can't be undone." and the step runs only on **Run step 2**.
- Given a ruleset change with an `admin` step,
  when it shows,
  then there is no **Run all steps**.
