# google-setup.sign-in

- Status: active
- Since: unreleased
- Source: HAL-714; google-setup-flow (HAL-621) section 3.5 points 1 and 2 and section 5.1; ux-checklists (HAL-1019) section 4.2 and CHECK U9; build-plan (HAL-678) D7

The Google setup view shall show **Sign in with Google** in the open step 7. Choosing it shall be busy, never `disabled`, while the host makes the sign-in, and shall open the address the host gives in the browser from inside the click; when the engine isn't answering it shall be `aria-disabled` with that sentence as its reason. While it waits the step shall say "Waiting for Google… Finish in your browser." once, with **Open again**, which opens the same address without starting another sign-in, and **Cancel**, which drops the host's pending sign-in, brings **Sign in with Google** back and moves focus to it. After the sign-in's lifetime (10 minutes) with no answer the step shall say "The sign-in didn't come back, or Google showed an error page instead. If it did, check the client ID in step 6. Then sign in again.", offer a way to open step 6 and show **Sign in with Google** again. When the host can't start the sign-in the step shall say "Couldn't start the sign-in: *reason*." with **Try again**, and focus shall stay on the button. When the record says a sign-in started that this window didn't begin, the step shall say "The last sign-in didn't finish. Sign in again." The address shall never appear on the screen.

## Examples

- Given the open step 7,
  when you choose **Sign in with Google**,
  then the host starts one sign-in and the address it gave is opened.
- Given a sign-in that is waiting,
  when you choose **Open again**,
  then the same address is opened and no second sign-in is started.
- Given a sign-in that is waiting,
  when 10 minutes pass,
  then the step says the sign-in didn't come back and **Sign in with Google** is back.
- Given the host can't start a sign-in,
  when you choose **Sign in with Google**,
  then "Couldn't start the sign-in" and its reason are shown with **Try again**.
