# assistant.build.show-tool

- Status: active
- Since: unreleased
- Source: HAL-17348 (T14 PR 13d, plan approved on HAL-17614); flow-assistant 3.8 and 5.7 (HAL-647); UX checklist T14 "show tool: Showed run r42" (HAL-1361)

The Build chat shall offer the model a `show` tool that takes an item's `kind`, `hub` and `id` and asks the host to show that item to the person, next to the chat. It shall answer "Showed <kind> <id> in the main view, next to the chat." when the host showed it. For a hub that isn't one of the workspace's, it shall show nothing, and for that or an item the host doesn't know, it shall answer "Error: there is no <kind> "<id>" in hub <hub>.". When the chat has nowhere to show items, it shall answer "Error: there's nowhere to show items in this chat.". None of these shall end the answer.

## Examples

- Given hub `support` with run `r42`,
  when the model calls `show` with kind `run`, hub `support` and id `r42`,
  then the host shows it and the result is "Showed run r42 in the main view, next to the chat.".
- Given the host doesn't know run `r99`,
  when the model calls `show` for it,
  then the result is "Error: there is no run "r99" in hub support.".
- Given the workspace has no hub `billing`,
  when the model calls `show` with hub `billing`,
  then nothing is shown and the result is "Error: there is no run "r42" in hub billing.".
- Given a chat on a phone, which has no main view to show items in,
  when the model calls `show`,
  then the result is "Error: there's nowhere to show items in this chat.".
