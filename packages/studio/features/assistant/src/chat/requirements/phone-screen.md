# assistant.chat.phone-screen

- Status: active
- Since: unreleased
- Source: HAL-17738 (T14 PR 18b); flow-assistant 11.2, 11.3 and 11.5 (HAL-647); microcopy 1.2 and 14.3 (HAL-751); component specs 0.2, 14, 15.1 and 15.3 (HAL-175); UX checklist T14 part 1 (HAL-1361)

Where the Studio shows the phone layout, the Assistant panel's top bar shall show Back, the Assistant's 24px orb in its halo ring, **Assistant**, and under it the status line: "Looking at: *page*" while it waits, "Running · …" with a dot while it answers, "Stopped by you" after Stop, and "Stopped · model call limit" after the last answer reached the model call limit. The chat's title, **New chat** and ✕ shall not be in the top bar. The top bar's ⋮ shall hold **New chat**, only while the chat has messages, **Recent chats**, and for a kept chat **Rename** and **Delete chat**. **Recent chats** shall open a sheet over the chat with the kept Build chats, most recently used first, each with its title, when it was last used, and the running dot or the violet dot (`assistant.chat.recent-chats-dot`), above the line "Keeps your 40 most recent chats on your computer."; picking one shall show that chat in place of the one before, and Back shall go back to the chat. **Rename** shall open the sheet "Rename chat". An empty Build chat shall show its heading in the middle of the transcript, with no customize skill link. Opening the panel, New chat and a chat picked from Recent chats shall put the focus on the title "Assistant".

## Examples

- Given the phone layout and a Build chat on Home,
  when the person opens the Assistant,
  then the top bar reads "Assistant" and "Looking at: Home", and the focus is on "Assistant".
- Given a chat with messages, when the person opens ⋮,
  then it holds New chat, Recent chats, Rename and Delete chat, in that order.
- Given the kept chats "Add a routine" and "Fix the triage alias", and an agent chat with Triage,
  when the person picks ⋮ › Recent chats,
  then a sheet lists the two Build chats above "Keeps your 40 most recent chats on your computer.".
- Given Recent chats open, when the person picks "Fix the triage alias",
  then the sheet closes and the panel shows that chat, with the focus on "Assistant".
- Given a chat whose last answer stopped after 16 model calls,
  then the status line reads "Stopped · model call limit".
