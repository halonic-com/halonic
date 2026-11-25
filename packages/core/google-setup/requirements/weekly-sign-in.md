# google-setup.weekly-sign-in

- Status: active
- Since: unreleased
- Source: HAL-18664 (design 3.5 items 3 and 4, 5.2 rows 1 to 3 and the paragraph under the table; the board's choice on HAL-18554)

Where the setup record says a personal app is in *Testing*, `weeklySignIn` shall give the end of the last sign-in, 7 days after it, and the time Studio reminds the user, a day before that, from the record alone and with no call to Google. For a Workspace account, a personal app *In production* or a record with no sign-in it shall give none. `signInEndsSoon` shall hold from the reminder time until the sign-in ends, and never while a refused refresh is saved. `isReminderDue` shall hold while the sign-in ends soon, unless the reminder was closed with **Not now** (`reminderClosedAt`) after the last sign-in; a new sign-in shall bring it back for the next week. Signing in again shall start a new 7 days.

## Examples

- Given a personal app in *Testing* signed in at 8 Nov 10:42, then the sign-in ends at 15 Nov 10:42, and it ends soon from 14 Nov 10:42 until 15 Nov 10:42, not before.
- Given the same timing with the record *In production*, or a Workspace account, then it never ends soon and has no end date.
- Given the reminder closed with **Not now** on 14 Nov, then it isn't due again for that sign-in; after a sign-in on 14 Nov 12:00 it is due again from 20 Nov 12:00.
