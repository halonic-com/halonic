# google-setup.weekly-reminder

- Status: active
- Since: unreleased
- Source: HAL-18664 (google-setup-flow (HAL-621) rev. 12, 3.5 items 3 and 4, 5.2 row 2 and the paragraph under the table; the board's choice on HAL-18554)

Where a personal account's app is in *Testing*, the last step, the sign-in (step 6 of six while the Scopes step is left out), shall show, after a sign-in, "Google ends this sign-in on 15 Nov at 10:42." (7 days after the sign-in, as a date and never a countdown), and the line that says every service passed shall add "Studio reminds you on 14 Nov to sign in again." A Workspace account or an app *In production* shall show neither. From a day before the sign-in ends until it ends, judged from the setup record with no call to Google, the connector shall have the chip **Sign-in ends soon**, and the setup item shall come back in the Inbox as "Sign in again for x@example.com" with the second line "Google ends the sign-in on 15 Nov, 10:42". Opened, the item shall show "Google ends this sign-in on 15 Nov at 10:42, because your app is in Testing. Sign in again now, and workflows that use Gmail and Drive keep running." (naming the account's services) with **Sign in with Google**, at the sign-in step with every other step folded. Closed with **Not now**, the item shall not come back to the Inbox for that sign-in; the chip shall stay until the user signs in again or the sign-in ends. Signing in again shall keep the client ID and secret and start a new 7 days.

## Examples

- Given a personal *Testing* app signed in at 8 Nov 10:42, then the sign-in step says "Google ends this sign-in on 15 Nov at 10:42." and "Studio reminds you on 14 Nov to sign in again."
- Given a Workspace account, then the sign-in step has no such line.
- Given the same *Testing* app on 14 Nov 11:00, then the chip says **Sign-in ends soon** and the Inbox lists "Sign in again for x@example.com" with "Google ends the sign-in on 15 Nov, 10:42".
- Given the reminder closed with **Not now**, then the Inbox doesn't list it again for that sign-in, and the chip stays.
