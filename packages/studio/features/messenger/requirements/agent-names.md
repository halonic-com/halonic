# messenger.agent-names

- Status: active
- Since: unreleased
- Source: the board on HAL-10 (25 Nov, 12:08 UTC), relayed on HAL-18473.

The Messenger shall name a chat, in its list row and its header, by its agent's name and title from the source, "Liam · CTO". When the agent has no title, it shall show the name alone, "Chief", with no dot. A channel shall keep its own title.

## Examples

- Given Liam, titled "CTO", whose chat Paperclip calls "Chat with Liam",
  when the board opens the Messenger and Liam's chat,
  then the row and the header say "Liam · CTO".
- Given Chief, with no title,
  when the board opens the Messenger and Chief's chat,
  then the row and the header say "Chief".
