# action-steppers.run

- Status: active
- Since: unreleased
- Source: HAL-17527 (approvals stream HAL-17488, PR 8); architecture note on HAL-17491, sections 1.3, 2.3 and 2.4; the board's decision on HAL-10 (24 Nov) that the screens follow the approved Inbox look, and section 6 (resume, irreversible steps); HAL-20267 (more than one match)

The stepper shall run one step per press, **Run step 2 of 3** for the next step still to do, and show under each step how it went: "Done already" for a step a check showed was done, and for a failure the service and its status, "Failed: GitHub refused this step (status 403).", with the service's own message only behind **Copy details**, after which the button reads **Try step 2 again**. A check whose answer found more than one match shall say so in Halonic's own words, "Failed. The service found more than one match, and this step works on exactly one. (status 200)", and **Copy details** shall copy those words without quoting them as the service's. Before an `irreversible` step runs, the stepper shall ask for an extra confirmation, and shall run nothing when it is cancelled. The stepper shall offer **Run all steps** only when every step is `routine`. While a step runs, no button shall start anything else.

## Examples

- Given step 2 of 3 failed with status 403,
  when the request shows,
  then step 2 says "Failed: GitHub refused this step (status 403)." with **Copy details**, which copies "Status 403. GitHub said: “Resource not accessible by integration”", and the button reads **Try step 2 again**.
- Given a check step recorded as failed with `more-than-one` and status 200,
  when the stepper shows it,
  then its line says "Failed. The service found more than one match, and this step works on exactly one. (status 200)", without "refused", and **Copy details** copies the same words, with no "said:".
- Given a release approval whose step 2 is irreversible,
  when the user presses **Run step 2 of 2**,
  then a dialog asks "Run step 2? It can't be undone." and the step runs only on **Run step 2**.
- Given a ruleset change with an `admin` step,
  when it shows,
  then there is no **Run all steps**.
