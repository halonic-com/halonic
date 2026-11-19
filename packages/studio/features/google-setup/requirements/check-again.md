# google-setup.check-again

- Status: active
- Since: unreleased
- Source: HAL-714; google-setup-flow (HAL-621) section 3.5 item 3 and section 5.1; ux-checklists (HAL-1019) section 4.5

The Google setup view shall show **Check again** under the result lines of step 7 while a line can change without a new sign-in: an API that is off (whose line ends "Switch it on, then check again."), or Google that was busy, refused the check or couldn't be reached. A box the user left empty shall not offer it, since only a new sign-in changes that. Choosing it shall ask the host to check each ticked service, be busy and keep focus on the button while it runs, and be `aria-disabled` with the engine's sentence as its reason when the engine isn't answering. The results shall be read from the setup record, in a polite live region, so the new result is read without moving focus; when every service passes and the button goes, focus shall move to the results. When the host found nothing new the step shall say why in its own words: Google couldn't be reached (check the connection, then check again), the sign-in or the client was refused (sign in again, or check step 6), or it couldn't check just now. When the engine can't do it the step shall say "Couldn't check again: *reason*." No text from Google shall appear.

## Examples

- Given a service whose API is off,
  when you choose **Check again** and the host finds it works,
  then the line becomes "Google is set up for x@example.com. Ledger works." and focus is on it.
- Given a box left empty,
  when step 7 opens,
  then there is no **Check again**.
- Given Google can't be reached,
  when you choose **Check again**,
  then the step says Halonic couldn't reach Google, and the button stays.
