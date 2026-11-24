# assistant.chat.engine-not-answering

- Status: active
- Since: unreleased
- Source: HAL-16797 (T14 PR 7); states H11, H12 and D5 (HAL-5896); microcopy 2 and 14.1 (HAL-751); flow-assistant 5.9 (HAL-647)

When a Build chat can't load because Halonic's engine isn't answering, the panel shall show "Couldn't load this chat" with "The engine isn't answering. It may still be starting." and **Try again**. While the engine isn't answering, an open chat shall keep what it showed under the line "The engine isn't answering. Showing what it said last." at the top, Send shall wait with that line as its reason, the text in the box shall stay, and Continue and Try again shall not be offered. When the engine answers again, the line shall go and Send shall work again.

## Examples

- Given the chat can't be read because the engine is `unavailable`, when the panel opens,
  then it shows "Couldn't load this chat", "The engine isn't answering. It may still be starting." and Try again.
- Given a chat is open and the engine stops answering, when the person types "Also add a test" and presses Send,
  then nothing is sent, the text stays, and Send names the line at the top as its reason.
- Given that state, when the engine answers again,
  then the line goes and Send sends "Also add a test".
