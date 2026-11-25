# action-steppers.results

- Status: active
- Since: unreleased
- Source: HAL-18081, from Sofia's keyboard and screen-reader check on HAL-18044 (ST1, WCAG 2.4.3; ST2, WCAG 4.1.3)

When a press takes away the control that had focus, the stepper shall move focus to where the user goes on: to the title when the request reaches another stage (the last step finished, the user declined, the sign-in ended), to GitHub's code after **Sign in to GitHub**, and after a browser or by-hand step to the next browser step's first control, or else to the line that says how the done step went. The stepper shall say each result through one polite status region that is on the page from the start: each step's result, the new stage's line and "Waiting for you to finish on GitHub…". Opening a request says nothing through it.

## Examples

- Given a release approval whose last step the user confirmed,
  when the step finishes,
  then focus is on the title and the status region says "Finished. Every step is done.".
- Given an on-demand request with two browser steps,
  when the user presses **Step 1 is done** and the step is done,
  then focus is on step 2's **Open the page**.
- Given GitHub's sign-in,
  when the user presses **Sign in to GitHub** and the code shows,
  then focus is on the code and the status region says "Waiting for you to finish on GitHub…".
