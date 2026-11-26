# ports.message-reactions

- Status: active
- Since: unreleased
- Source: HAL-19139 (the board's yes on the reactions card, 26 Nov 12:21 UTC); build plan approved by Liam on HAL-19139

The ports package shall declare the `MessageReactions` port, separate from `AgentMessaging`, with exactly the six emoji 👍 ❤️ 😂 😮 ✅ 👀 in that order, `list(conversation)` answering a conversation's reactions by message ID or a `MessagingRefusal`, and `react(message, emoji, on)` adding or removing the person's own reaction and answering the message's reactions after it or a refusal; `isReactionEmoji` shall accept only the six.

## Examples

- Given "👍", when `isReactionEmoji` reads it, then it is true; given "🎉" or the text "thumbs up", then it is false.
- Given a host too old for reactions, when Studio lists a conversation's reactions, then the answer is refused with `not-supported` and the conversation still shows.
