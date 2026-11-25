# assistant.chat.item-page

- Status: draft
- Since: unreleased
- Source: HAL-18054 (T14 PR 17c); flow-assistant 2.4 and 6.1 (HAL-647)

Where the chat on the left of an item's page shows, the Studio shall keep it a Build chat about the item, with no Chat with chip; its status line shall read "About: <name>" while nothing runs, with the name the page shows; its chat menu shall list only the Build chats about the item, and picking one or New chat shall change the chat the page shows; its ⋮ shall offer **Open as tab** for a kept chat, which gives that chat its own tab and the page a new chat about the item; and while it has no messages it shall say "What should change in <name>?" and "I make changes in your files and mark them; you accept or reject each one." at the top of the transcript, with no halo.

## Examples

- Given the page of workflow "Triage" with no chat about it, then its chat reads "About: Triage" and "What should change in Triage?", and has a Model chip and no Chat with chip.
- Given a chat about "Triage" and a chat about no item, when the chat menu opens, then it lists the first and not the second.
- Given a kept chat about "Triage" on its page, when Open as tab is picked in the ⋮, then the chat opens in its own tab and the page shows a new chat about "Triage".
