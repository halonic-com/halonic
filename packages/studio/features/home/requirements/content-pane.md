# home.content-pane

- Status: active
- Since: unreleased
- Source: HAL-20741; HAL-20673 rail flows, section 2, line 25

While no chat is open, Home's content pane shall show Home's sections as the shell draws them. While a chat is open, it shall show that chat. When an open chat leaves the list, deleted in Home or elsewhere, the content pane shall show Home's sections again. A new chat that has no message yet shall stay open, though the list doesn't show it.

## Examples

- Given no chat is open,
  when Home is shown,
  then its content pane shows Get set up, Needs you, Recent runs and Spend, as far as features added them.
- Given "Triage" is open,
  when it is deleted,
  then the content pane shows Home's sections.
- Given the person pressed New chat,
  when the list is read again before the first message,
  then the new chat stays open.
