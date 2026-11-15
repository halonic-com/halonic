# google-setup.connector-block

- Status: active
- Since: 0.1.0
- Source: HAL-713 (C3); google-setup-flow (HAL-621) section 4.4; ux-checklists (HAL-1019) sections 3.4 and 3.5, CHECK U8; security review (HAL-705) A7

The Google setup feature shall give the connector page a Google block for one account. Before the setup has a sign-in or a saved client secret it shall say the account isn't signed in yet and offer **Set up**, which opens the account's setup item. After it, the block shall show the state chip the connector status view shows, the section "How it connects", and the rows Signed in as (address and date, with **Sign in again**), Route (naming the computer that keeps the secret, the same one the secret row names), Account type, Google project (with a link to the client's page in Google Cloud), Client ID in full with **Copy**, Client secret ("Saved · date", with **Replace secret** and where it is kept) and Allowed, one chip for each ticked service. **Sign in again** and **Replace secret** shall open the setup item. When another account uses the client, the secret row shall say "Used by *x@example.com* and *y@example.com*". At the bottom the block shall offer **Disconnect Google…**, unavailable with its reason as visible text while the engine isn't answering. On a phone the block shall be text only, with "View only on a phone. Change connectors and sending on your computer.". The block shall never show the client secret, and never say it is removed from this computer.

**Disconnect Google…** shall ask "Disconnect *x@example.com*?" with "Halonic asks Google to end this sign-in, deletes the saved client secret and sign-in, and stops using them. Gmail and Drive stop working. Your Google Cloud project stays as it is." (the ticked services only), or, when the client is shared, "Halonic asks Google to end this sign-in, deletes it and stops using it. The client secret stays, because *y@example.com* uses it.". The question shall have **Disconnect** (danger) and **Cancel**, with focus starting on **Cancel**; **Cancel** shall change nothing and return focus to the button. **Disconnect** shall ask the host to disconnect the account, be busy while it runs, close the question, show a toast "Disconnected *x@example.com*" and, once the block shows **Set up**, move focus there. When the host says Google couldn't be reached, the toast shall add "Google couldn't be reached to end the sign-in. You can remove access in your Google account." with **Open Google account**. When the host can't do it, the question shall stay open and say "Couldn't disconnect: *reason*.".

## Examples

- Given an account that never signed in and has no saved secret,
  when the block shows,
  then it offers **Set up** and shows no rows.
- Given a signed-in account with a saved secret,
  when the block shows,
  then the secret row says "Saved" and the date, and no text holds a secret.
- Given a client shared with y@example.com,
  when the block shows,
  then the secret row says it is used by both addresses.
- Given a signed-in account,
  when you choose **Disconnect Google…**,
  then the question names the address and the ticked services, **Cancel** has focus and nothing is disconnected yet.
- Given the question is open,
  when you choose **Disconnect** and the host says Google couldn't be reached,
  then the account is disconnected and the toast links to the Google account's permissions.
- Given the host can't disconnect,
  when you choose **Disconnect**,
  then the question stays open and says "Couldn't disconnect: the engine isn't answering.".
- Given a phone,
  when the block shows,
  then it has no button that changes anything and says it is view only.
