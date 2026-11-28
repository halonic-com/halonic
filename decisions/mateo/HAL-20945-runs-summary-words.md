# Decision: the click test's places step accepts the Runs app's summary line with runs

- Approval: the Paperclip task HAL-20945, where Liam proposed this fix (accept the "Today: " summary as well as "No runs yet today.")
- Kind: internal

`studio-click-test.places-open` required the Runs page to say "No runs yet today.". That holds only once step `disconnect` has run: in a selective run ("steps this change touched") `disconnect` is skipped, the Paperclip account connected in step 3 stays up, and the Runs app lists its run, so the summary line reads "Today: 1 run · 0 failed" (main runs 46123778251 and 46126494600 failed as `NO_RUNS_PAGE`). The requirement now accepts either summary line, gains an example for the connected case, and the step's words add "Today: ", read from the Runs app's `summaryWords` test because the code builds the line from pieces. The wide-window "No run open" check is unchanged. No test is weakened: every existing assertion stays, and one new test covers the connected case.

## Covers

- studio-click-test.places-open
