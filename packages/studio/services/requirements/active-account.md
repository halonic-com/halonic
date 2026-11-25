# services.active-account

- Status: active
- Since: unreleased
- Source: HAL-18672; plan approved on HAL-18710

While more than one account is linked, the Studio shall show the Inbox, Messenger, search and overview of one account at a time: the one the person picked, saved in the host settings so every window reads it, or the first linked account when none is picked or the picked one is no longer linked. Switching shall make every window read again, and events of the other accounts shall not.

## Examples

- Given two linked accounts and the first one picked,
  when the Inbox reads its items,
  then it holds only that account's items.
- Given the second account picked in one window,
  when another window's store watch fires,
  then that window's list holds only the second account's conversations.
- Given a picked account that was disconnected,
  when the conversations are read,
  then they are the first remaining account's.
- Given the first account picked,
  when the second account changes,
  then no change reaches the reader.
