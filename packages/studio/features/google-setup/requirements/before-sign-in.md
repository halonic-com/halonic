# google-setup.before-sign-in

- Status: active
- Since: 0.1.0
- Source: HAL-714; google-setup-flow (HAL-621) sections 2.3 and 3.4; ux-checklists (HAL-1019) section 4.1

The Google setup view shall show, in the open step 7 above the sign-in, what the person should expect from Google. For a personal account it shall say that Google shows a warning first, and show it as a Studio callout titled "Google hasn't verified this app" with the numbered clicks: "Advanced", "Go to *app name* (unsafe)" with the app name chosen in step 3, and the boxes of the ticked services only, then "Continue". For a Workspace account it shall say the admin may have to allow the app and offer **Copy a note for your admin**. The note shall hold the project, the client ID, what the app asks for in the sheets' words and where in the Admin console to allow it, and shall never hold the client secret.

## Examples

- Given a personal account with Ledger ticked and "Halonic (own app)" as the app name,
  when step 7 opens,
  then the callout says "Go to Halonic (own app) (unsafe)" and "Tick the boxes for Ledger".
- Given a Workspace account whose setup has a project and a client ID,
  when step 7 opens and you choose **Copy a note for your admin**,
  then the clipboard holds the project, the client ID and "Ledger", and no secret.
