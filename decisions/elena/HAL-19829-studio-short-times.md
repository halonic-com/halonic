# Decision: the Assistant's chat times and the account button follow the Messenger's polish

- Approval: the board asked for short times and bigger header avatars across Halonic's apps on HAL-10 (HAL-19536 items 3 and 4); Sofia named these Studio places on HAL-19755's `proposal`; Liam signs this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:vvsPPsv2dxljWzVY5+cdofQEl3rvtFStLWrXgzlA88kMUIK3L3q7Te8pgHOcCVNNUy5TPpU3Mrd3WybaqDTcDw==

`assistant.chat.menu` said a chat's row shows when it was last used as
"10:42" today, "yesterday", "Mon" within the week, then "3 Nov", a format of
the Assistant's own, always 24-hour and in English order. It now shows the
kit's short time (`kit.time-stamp`, #6499), the one the Messenger's chat list
uses: "Yesterday" with a capital, "3 Nov" this year, "02/12/2025" before that,
each in the window's format, so a 12-hour region reads "9:05 AM".

`account-menu.menu` said the customer's initials are a ghost icon button. The
kit Button's 16px icon slot shrank the initials to an icon, so it is now a
round button holding the whole 28px avatar tile. Not the 40px header size:
the desktop top bar is 35px high and would grow. The Team PR page's author
line gets the 40px header size, as the Messenger's and the Inbox's headers.

The `chatTime` test changes its expected words to the kit's ("Yesterday",
"02/12/2025") and gains a 12-hour and a month-first case; no case is dropped.
The account menu's test gains a check for the 28px tile.

## Covers

- assistant.chat.menu
- account-menu.menu
