# remote.phone-messenger-tab

- Status: draft
- Since: unreleased
- Source: HAL-19050 (follow-up of HAL-18899 and HAL-18900; Sofia's flows on HAL-17509, flow C; Noah's HAL-17514 `wording`, rows p02a and p05c)

The phone's screen of a paired computer shall show its tabs in the order Inbox, Messenger, Agents. The Messenger tab shall be the phone's Messenger (`remote.phone-messenger`) over that computer's gateway client, and a link tapped in it that `isAllowedWebLink` passes shall go to the page's system-browser opener with its full address. While the computer speaks only version 3, the Messenger tab shall hold only "Update Halonic on <computer>", "Update Halonic on <computer> to use Inbox and Messenger from your phone." and "Agents still works.", and read nothing.

## Examples

- Given a paired computer that speaks version 4,
  when its screen shows,
  then the tab bar reads Inbox, Messenger, Agents.
- Given a computer with the chats Engineering and Chief,
  when the person opens the Messenger tab,
  then both chats are listed.
- Given a message with a link to `https://github.com/acme/app/pull/12`,
  when the person taps it,
  then the page's opener gets that address.
- Given a computer that speaks only version 3,
  when the person opens the Messenger tab,
  then it holds only the three update lines.
