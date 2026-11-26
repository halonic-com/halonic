# assistant.chat.menu

- Status: active
- Since: unreleased
- Source: HAL-16801 (T14 PR 10); short times from HAL-19536 (HAL-19829); flow-assistant 5.5 (HAL-647); states H4 (HAL-5896); microcopy 14.1 and 19.5 (HAL-751); component specs 21.5 (HAL-175)

The panel's title shall open the chat menu: **New chat**, a divider, then the workspace's kept chats, most recently used first, and under them the line "Keeps your 40 most recent chats on this computer.". Each row shall show the chat's icon, its title, when it was last used as the kit's short time (`kit.time-stamp`) in the window's format ("10:42" today, "Yesterday", "Mon" within the week, "3 Nov" this year, then "02/12/2025"), and at its right the running dot while it answers, else a "2 to review" chip while items still have changes to review from it. The chat shown shall be checked. A row's name shall be its title, its time, then "answering" or "2 to review" when they apply. Picking a row shall show that chat in the panel with focus in the box. With no kept chats, the menu shall hold **New chat** and the line only.

## Examples

- Given the kept chats "Add a routine", used at 10:42 today and answering, and "Fix the triage alias", used at 09:15 with 2 items to review,
  when the person opens the menu, then its rows are named "Add a routine, 10:42, answering" and "Fix the triage alias, 09:15, 2 to review", in that order.
- Given no kept chats, when the person opens the menu,
  then it shows New chat and "Keeps your 40 most recent chats on this computer." only.
- Given the menu is open, when the person picks "Fix the triage alias",
  then the panel shows that chat, checked in the menu, with focus in the box.
