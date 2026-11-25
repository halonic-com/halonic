# google-setup.connector-problem

- Status: active
- Since: unreleased
- Source: HAL-10596; HAL-715; google-setup-flow (HAL-621) section 5.2 (rev. 12 rows 1 and 3 since HAL-18664); ux-checklists (HAL-1019) sections 5 and 8 points 3 and 4

When Google has refused an account, the Google setup view shall open at the step the refusal needs and show one banner above the steps, with one button that opens that step and never goes to Google itself. For a refused sign-in it shall read "Google no longer accepts Halonic's sign-in for x@example.com. This happens when access is removed in your Google account, when the password changes, or when an app in Testing reaches 7 days. Nothing ran." with **Sign in with Google**, and open at step 7; the clause "or when an app in Testing reaches 7 days" shall go when the personal app is *In production*. When the connector state is the weekly end of a personal *Testing* app (`weeklyEnd`), the banner shall read "Your weekly sign-in ended. Google ends the sign-in after 7 days for apps in Testing. Sign in again; your setup is kept. Nothing ran." instead, with **Sign in with Google**, the folded "Why not publish?" under it, and the item opened at step 7 only. For a refused client secret it shall read "Google no longer accepts the saved client secret. Paste the current one." with **Replace secret**, and open at step 6. For a client Google no longer knows it shall read "Google doesn't recognise this client any more. Create a new client and sign in again." with **Create a new client**, and open at step 5. The banner shall not take focus. On a phone it shall have no button and add "Fix this on your computer: Library › Connectors"; for a refused sign-in that isn't the weekly end it shall also add "Your client ID and secret are kept. Only the sign-in is needed." The steps it names shall come from the generated steps, so their numbers follow them.

## Examples

- Given an account whose sign-in Google refused,
  when the item opens,
  then step 7 is open and the banner has **Sign in with Google**.
- Given a refused sign-in on a personal app *In production*,
  when the item opens,
  then the banner has no "Testing" clause.
- Given a refused sign-in 7 days after the last sign-in of a personal *Testing* app,
  when the item opens,
  then the banner reads "Your weekly sign-in ended." with "Why not publish?" folded under it, and step 7 is open.
- Given the same app refused 3 days after the last sign-in,
  when the item opens,
  then the banner reads "Google no longer accepts Halonic's sign-in for x@example.com." and the causes.
- Given a refused client secret,
  when the item opens,
  then step 6 is open and the banner has **Replace secret**.
- Given an account Google has refused nothing for,
  when the item opens,
  then there is no banner.
- Given a phone and a refused sign-in that isn't the weekly end,
  when the item opens,
  then the banner has no button and the page says "Fix this on your computer: Library › Connectors"
  and "Your client ID and secret are kept. Only the sign-in is needed."
- Given a phone and the weekly end of a sign-in,
  when the item opens,
  then the page does not say the client ID and secret are kept.
- Given a phone and a refused client secret,
  when the item opens,
  then the page does not say the client ID and secret are kept.
