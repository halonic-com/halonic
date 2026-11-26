# inbox.agent-notifications-start

- Status: draft
- Since: unreleased
- Source: HAL-17919, from the board's "Done when" check of HAL-17897; starts `services.agent-notifications` and `services.agent-quiet-hours`

While a workspace window is open, and the app gives it both the agents' messaging and desktop notifications, the Studio shall watch the agents' items once for that window (`services.agent-notifications`), through quiet hours (`services.agent-quiet-hours`), and stop when the window or folder closes. When the person clicks a notification for an Inbox item, the Studio shall open the Inbox on that item; it shall only show it, never answer it. A conversation has nowhere to open until the Messenger window can take it, so its click opens nothing. Until Settings has quiet hours, none are set.

## Examples

- Given an open workspace with a connected Paperclip,
  when a card addressed to the board arrives,
  then one notification "New card from Ops lead" shows.
- Given that notification,
  when the person clicks it,
  then the Inbox opens with the card selected.
- Given the folder closes,
  when another card arrives,
  then nothing shows.
