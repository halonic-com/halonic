# remote.phone-messenger-links

- Status: draft
- Since: unreleased
- Source: HAL-20070 (follow-up of HAL-19050; HAL-20040 acceptance rows L4 and L7; item 5 of the HAL-20039 design note; the security review of #6325)

A link in a phone chat shall be a link whose accessible name is its full address followed by " opens in your browser", while it shows only the address. When the page runs in a browser instead of the Android app, a tapped link that `isAllowedWebLink` passes shall open in a new tab cut off from the page (`noopener`), and any other link shall open nothing. A chat's back button shall be named "Messenger" and shall return to the list of chats. The phone shall split a message of 100,000 characters into text and links in well under a second, whatever its characters, so no message can freeze the chat.

## Examples

- Given a message with `https://github.com/acme/app/pull/12`,
  when a screen reader reaches it,
  then it hears a link named "https://github.com/acme/app/pull/12 opens in your browser".
- Given the page in a browser,
  when the person taps that link,
  then it opens in a new tab with `noopener`.
- Given an open chat,
  when the person taps Messenger,
  then the list of chats shows again.
- Given a message of 100,000 `[`,
  when the chat shows it,
  then splitting it takes well under a second.
