# home.content-pane

- Status: active
- Since: unreleased
- Source: HAL-20741; HAL-20673 rail flows, section 2, line 25

While no chat is open, Home's content pane shall show Home's sections as the shell draws them. While a chat is open, it shall show that chat and hold it in Home, and it shall give the chat back when it shows something else or goes. When the open chat leaves Home (deleted, or shown in the panel or a tab), or leaves the list, the content pane shall show Home's sections again. The content pane shall keep a new chat open before its first message, though the list doesn't show it yet.

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
- Given "Triage" is open in Home,
  when the person picks it in the side panel's chat menu,
  then Home's content pane shows Home's sections.
