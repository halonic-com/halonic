# google-setup.connector-section

- Status: active
- Since: 0.1.0
- Source: HAL-9773 (follow-up to HAL-713)

The Google setup feature shall add its block to the page of a connector, through the shell's item page sections, for the connector whose id its account's setup record links to. A connector with no such account shall get no block, and the page shall look as it does without the feature. **Set up**, **Sign in again** and **Replace secret** shall open the account's setup item in the Inbox and show the Inbox. **Disconnect Google…** shall ask the app to disconnect the account, then read the account again, so the block shows **Set up** once it is disconnected. When the accounts can't be read, the block shall keep what it showed and mark the engine as not answering.

## Examples

- Given a Google account linked to the connector `gmail`,
  when the page of `gmail` opens,
  then the Google block shows for that account.
- Given the page of a connector that no Google account is linked to,
  when it opens,
  then no Google block shows.
- Given the block of a signed-in account,
  when **Sign in again** is pressed,
  then the account's setup item opens in the Inbox.
- Given the block of a signed-in account,
  when **Disconnect Google…** is confirmed,
  then the app is asked to disconnect it and the block shows **Set up** once the account is read again.
- Given a shown block,
  when the accounts can't be read,
  then the block stays and **Disconnect Google…** is unavailable.
