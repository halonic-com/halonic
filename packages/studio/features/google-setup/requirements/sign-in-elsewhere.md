# google-setup.sign-in-elsewhere

- Status: active
- Since: 0.1.0
- Source: HAL-714; google-setup-flow (HAL-621) section 3.5 item 10; ux-checklists (HAL-1019) section 4.7 and section 8 point 7

While the host says this window is not on the computer that runs Halonic (`signInEntry` is `elsewhere`: a phone, or a served browser on another computer), the open step 7 shall have no **Sign in with Google**, no **Open again** and no **Cancel**. It shall say "Google sends the sign-in back to the computer running Halonic. Finish this step there." When the host says the command exists, the text shall go on "…there, or run `halonic google sign-in gaccount_1` on it.", with the setup record's ref in the command (never the connector's address, which the command refuses) and a **Copy** button for it. The notes and results of step 7 shall show as before. On a phone, where the setup is read-only, the current step 7 shall show the same text instead of "Continue on a computer.", with the command as text and no **Copy** button. Where the host says the sign-in is here, step 7 shall show **Sign in with Google** as before.

## Examples

- Given a served browser on another computer and a host without the command,
  when step 7 opens,
  then the text ends after "Finish this step there." and there is no **Sign in with Google**.
- Given the host has the command,
  when step 7 opens,
  then the text names `halonic google sign-in gaccount_1` and **Copy the command** copies it.
- Given a phone on step 7,
  when the item opens,
  then it shows the command as text and has no button.
