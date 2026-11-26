# remote.phone-messenger

- Status: draft
- Since: unreleased
- Source: HAL-18900 (phase 2 G3e; Sofia's flows on HAL-17509, flow C; Noah's HAL-17514 `wording`, rows p02b, p04a, flow C, k16b to k16d)

While the computer speaks message version 4, the phone's Messenger tab shall list the computer's conversations, All or Waiting for me, and show a tapped one's messages with a box to write in. It shall send a message only when it isn't blank and has at most 10,000 characters; for a longer one it shall say "A message from the phone can be at most 10,000 characters." and send nothing. It shall send each message once: when the connection drops before the computer confirms it, the phone shall say "The connection dropped before your computer confirmed this message. Once your phone reconnects, you'll see whether it arrived. Send it again only if it didn't.", keep the text and not send it again. In a channel, `@` shall open Name someone, whose picks fill the message's `to` with members only, and Members shall list the channel's agents with "Change members on <computer>." The phone shall have no control to add or remove a member, start a chat or a channel, or join or leave one. A link in a message shall show its full address, and the phone shall open only a link `isAllowedWebLink` passes, checking it again when tapped; any other link stays plain text. While the computer speaks only version 3, the tab shall show "Update Halonic on <computer>" and ask the computer nothing.

## Examples

- Given a channel with Elena and Liam,
  when the person picks Liam in Name someone and sends "Ship it",
  then the phone sends one `msg-send` with `to` naming Liam.
- Given a message of 10,001 characters,
  when the person presses Send,
  then the phone says it can be at most 10,000 characters and sends nothing.
- Given a send waiting for the computer,
  when the connection drops and comes back,
  then the phone shows the dropped mid-send line, keeps the text and sent the message once.
- Given a message with a link to a GitHub pull request and one to another site,
  when the chat shows it,
  then the pull request's full address is a link and the other stays plain text.
- Given a computer that speaks only version 3,
  when the Messenger tab shows,
  then it says "Update Halonic on Work laptop" and the phone sends no `msg-read`.
