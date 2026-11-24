# assistant.chat.engine-not-answering

- Status: active
- Since: unreleased
- Source: HAL-16797 (T14 PR 7), HAL-17334 (T14 PR 7b); states H11, H12, H15 and D5 (HAL-5896); microcopy 2, 14.1 and 14.3 (HAL-751); flow-assistant 5.9 (HAL-647)

When a Build chat can't load because Halonic's engine isn't answering, the panel shall show "Couldn't load this chat" with "The engine isn't answering. It may still be starting." and **Try again**. While the engine isn't answering, an open chat shall keep what it showed under the line "The engine isn't answering. Showing what it said last." at the top, Send, Continue and Try again shall wait with that line as their reason, and the text in the box shall stay. In a served Studio the line shall be "Halonic on the server isn't answering. The reply carries on there, and shows here when it's back.", and on a phone "Halonic on your computer isn't answering. The reply carries on there, and shows here when it's back.". When the engine answers again, the line shall go and Send, Continue and Try again shall work again.

## Examples

- Given the chat can't be read because the engine is `unavailable`, when the panel opens,
  then it shows "Couldn't load this chat", "The engine isn't answering. It may still be starting." and Try again.
- Given a chat is open and the engine stops answering, when the person types "Also add a test" and presses Send,
  then nothing is sent, the text stays, and Send names the line at the top as its reason.
- Given that state, when the engine answers again,
  then the line goes and Send sends "Also add a test".
- Given a reply ended with Try again and the engine stops answering,
  then Try again stays in its place, names the line as its reason and sends nothing until the engine answers again.
- Given a served Studio whose Halonic stops answering,
  then the line reads "Halonic on the server isn't answering. The reply carries on there, and shows here when it's back.".
