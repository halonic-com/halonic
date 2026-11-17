# google-setup.sign-in-ended

- Status: active
- Since: unreleased
- Source: HAL-714; google-setup-flow (HAL-621) section 5.1; build-plan (HAL-678) D4; HAL-10323

While the setup record says how the last sign-in ended without signing anyone in (`lastSignInEnded`), the open step 7 shall say so above **Sign in with Google**. For `cancelled` it shall say "You cancelled the sign-in. Nothing was saved." For `secretRefused` it shall say "Google didn't accept the client secret. Paste it again from your client's page, then sign in again." with **Open step 6**, which shall open with the field for the new secret. For `adminBlocked` it shall say "Your organisation's admin hasn't allowed this app yet. This is set by your admin, not by Halonic." with **Copy a note for your admin**; a Workspace account shall then see that button once, so the admin block before the sign-in button is left out. The cancelled note shall not use the words of the Testing row in the folded error list ("Your app is still in Testing"): that row is Google blocking the sign-in on its own page, this one is the person's choice. A waiting sign-in that ends this way shall show its note, not "The last sign-in didn't finish." With no ending in the record the step shall show none of these.

## Examples

- Given a record that says the sign-in was cancelled,
  when step 7 opens,
  then the step says "You cancelled the sign-in. Nothing was saved." and **Sign in with Google** is shown.
- Given a record that says the client secret was refused,
  when you choose **Open step 6**,
  then step 6 opens with the field for the new secret.
- Given a record that says the admin blocked the app,
  then **Copy a note for your admin** is shown, once, on a Workspace account too.
- Given a waiting sign-in whose record then says it was cancelled,
  then the step shows the cancelled note and not "didn't finish".
