# assistant.chat.recent-chats-dot

- Status: active
- Since: unreleased
- Source: Sofia's Studio and Messenger alignment proposal on HAL-19755 (26 Nov), point 1 of HAL-19141; built on HAL-19764

The Assistant's **Recent chats** sheet shall list its chats as plain rows, as the Messenger lists its chats. While a chat that isn't answering has items to review, its row shall show a violet dot after its title in place of the "2 to review" label, and a screen reader shall read "2 to review" for it. While a chat answers, its row shall show the running dot before its time, read as "answering", and no violet dot.

## Examples

- Given the kept chats "Add a routine" and "Fix the triage alias", with 2 items to review,
  when the person opens Recent chats,
  then "Fix the triage alias" shows the violet dot, read as "Fix the triage alias, 2 to review, 09:15", and "Add a routine" shows none.
- Given "Fix the triage alias" answering,
  when the person opens Recent chats,
  then its row shows the running dot and no violet dot, read as "Fix the triage alias, answering, 09:15".
