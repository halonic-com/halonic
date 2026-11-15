# google-setup.sign-in-results

- Status: active
- Since: 0.1.0
- Source: HAL-714; google-setup-flow (HAL-621) section 3.5 points 3 and 4 and section 5.1

The Google setup view shall show, in the open step 7 above **Sign in with Google**, one line for each ticked service whose check ran at or after the last sign-in, read from the setup record. A line shall say that the service works, or is allowed, or what went wrong in words from the sheet and the record: the box left empty, the API that is off with the project and a **Switch it on** link to its page, or that Google refused the check, was too busy to answer it (wait, then sign in again) or couldn't be reached. The API-off line ends "then sign in again" until **Check again** exists. It shall never repeat text that Google sent. When every ticked service has such a result and every one passed, the view shall show one sentence instead: "Google is set up for *address*. *Services* work." A service whose check is older than the last sign-in, or never ran, shall show no line and shall stop that sentence from showing. Before a sign-in, nothing shows.

## Examples

- Given a sign-in whose one ticked service works,
  when step 7 opens,
  then it says "Google is set up for x@example.com. Ledger works."
- Given a service whose API is off,
  when step 7 opens,
  then its line names the API and project, **Switch it on** opens the page for it, and "Google is set up" doesn't show.
- Given two ticked services where one was never checked,
  when step 7 opens,
  then "Google is set up" doesn't show.
- Given a result from before the last sign-in,
  when step 7 opens,
  then that result doesn't show and isn't counted.
- Given an account that hasn't signed in,
  when step 7 opens,
  then no results show.
