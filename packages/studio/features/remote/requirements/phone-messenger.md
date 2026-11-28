# remote.phone-messenger

- Status: draft
- Since: unreleased
- Source: HAL-18900 and HAL-19042 (phase 2 G3e; Sofia's flows on HAL-17509, flow C; Noah's HAL-17514 `wording`, rows p02b, p04a, p06e, flow C, k16b to k16d; Noah's check on HAL-19232; Noah's design check on HAL-19082, items 10 to 15)

While the computer speaks message version 4, the phone's Messenger tab shall list the computer's conversations, All or Waiting for me, and show a tapped one's messages with a box to write in. Each chat's row shall show the agent's picture, its name with its source after it (a channel's size instead), the time of its newest message, the needs-you dot while it waits for the person, and under the name "Draft: <text>" while text is left in its box, else "Working…" while its agent works on it. Until the conversations are read, the tab shall show skeleton rows, tell a screen reader "Loading Messenger" (the empty and loading words are `remote.phone-messenger-tab`'s), and Try again under "Still loading" shall read the conversations and the agents again. A chat's header shall show the agent's picture, the chat's name and a status line: the source and the agent's activity, or a channel's members with its lead marked. The person's messages shall sit on the right; an agent's reply shall show under the agent's picture and name, which is its heading for a screen reader, after a day line such as "Today". It shall send a message only when it isn't blank and has at most 10,000 characters; for a longer one it shall say "A message from the phone can be at most 10,000 characters." and send nothing. While a message is on its way, the line under the box shall say "Sending…". It shall send each message once: when the connection drops before the computer confirms it, the phone shall say "The connection dropped before your computer confirmed this message. Once your phone reconnects, you'll see whether it arrived. Send it again only if it didn't.", keep the text and that line, also when the chat is closed and opened again, and not send it again. Once the computer takes a message, its chat shall keep no draft of it, even when the chat was closed while it was on its way. In a channel, `@`, typed in the box or its Name someone button, shall open the box's list of members, whose picks fill the message's `to` with members only and show a tick on each member already named, the new To line said to a screen reader after each pick, and Members shall list the channel's agents with "Change members on <computer>." The phone shall have no control to add or remove a member, start a chat or a channel, or join or leave one. A link in a message shall show its full address, and the phone shall open only a link `isAllowedWebLink` passes, checking it again when tapped; any other link stays plain text. If a read of the conversations, the agents or a chat's messages is refused or cut off, the tab shall say so in place of the list or chat, with Try again, which reads again only what failed; when the computer says a source is offline, it shall name it: "Paperclip · Halonic is offline, as of 14:02, so its chats may be out of date." A read refused for any other reason shall say "Couldn't load it: <computer> turned it down. You can open it there.", and one cut off by a drop "Couldn't load it: <computer> isn't answering." While the computer speaks only version 3, the tab shall show "Update Halonic on <computer>" and ask the computer nothing.

## Examples

- Given a channel with Elena and Liam,
  when the person picks Liam in Name someone and sends "Ship it",
  then the phone sends one `msg-send` with `to` naming Liam.
- Given a chat with Chief of the source Paperclip · Halonic, whose agent is working,
  when the Messenger tab lists it,
  then its row says "Chief · Paperclip · Halonic", its time and "Working…".
- Given Liam named in a channel's message,
  when the person types `@` again,
  then Liam's row in the list of members shows a tick.
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
- Given a read of the conversations the computer refuses with `offline`,
  when the sources read names Paperclip · Halonic offline since 14:02,
  then the tab says "Paperclip · Halonic is offline, as of 14:02, so its chats may be out of date."
  with Try again, and Try again sends one new `msg-read` of the conversations.
