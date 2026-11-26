# services.shared-changes

- Status: active
- Since: unreleased
- Source: the sync service design approved by the maintainer on HAL-19201, section 4 "Subscribe API" (PR 5, HAL-19337)

While the Inbox, the Messenger, the overview and the notifications listen for changes of `AgentMessaging`, the Studio shall ask the agent host for changes with one long poll, and hand every change it answers to each of them. When the last of them stops listening, the Studio shall stop the long poll. When the long poll fails, each of them shall get its error, and the next to listen shall start it again.

## Examples

- Given the Inbox and the Messenger open with the overview and the notifications, when they wait for changes,
  then the agent host has one changes long poll open, not four.
- Given two readers waiting, when the host answers a change of the Acme source,
  then both readers get it.
- Given the long poll failed, when the Inbox listens again,
  then a new long poll starts.
