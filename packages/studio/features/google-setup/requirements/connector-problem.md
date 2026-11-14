# google-setup.connector-problem

- Status: active
- Since: 0.1.0
- Source: HAL-715; google-setup-flow (HAL-621) section 5.2; ux-checklists (HAL-1019) sections 5 and 8 points 3 and 4

When Google has refused an account, the Google setup view shall open at the step the refusal needs and show one banner above the steps, with one button that opens that step and never goes to Google itself. For a refused sign-in it shall read "Google no longer accepts the sign-in for x@example.com. This happens when access is removed in your Google account, when the password changes, or when an app in Testing reaches 7 days. Nothing was sent." with **Sign in with Google**, and open at step 7; the clause "or when an app in Testing reaches 7 days" shall go when "In production" was ticked. When the sign-in check says the app is probably still in Testing, the banner shall lead with the bold line "Your app is probably still in Testing. Google ends the sign-in after 7 days for those. Publish it, then sign in again." and the item shall open at step 3 first. For a refused client secret it shall read "Google no longer accepts the saved client secret. Paste the current one." with **Replace secret**, and open at step 6. For a client Google no longer knows it shall read "Google doesn't recognise this client any more. Create a new client and sign in again." with **Create a new client**, and open at step 5. The banner shall not take focus. On a phone it shall have no button and add "Fix this on your computer: Workspace settings › Connectors". The steps it names shall come from the generated steps, so their numbers follow them.

## Examples

- Given an account whose sign-in Google refused,
  when the item opens,
  then step 7 is open and the banner has **Sign in with Google**.
- Given a refused sign-in on a personal account with "In production" ticked,
  when the item opens,
  then the banner has no "Testing" clause.
- Given a refused sign-in 7 days after the last sign-in with no "In production" tick,
  when the item opens,
  then the banner leads with "Your app is probably still in Testing." and step 3 is open.
- Given a refused client secret,
  when the item opens,
  then step 6 is open and the banner has **Replace secret**.
- Given an account Google has refused nothing for,
  when the item opens,
  then there is no banner.
- Given a phone and a refused sign-in,
  when the item opens,
  then the banner has no button and the page says "Fix this on your computer: Workspace settings › Connectors".
