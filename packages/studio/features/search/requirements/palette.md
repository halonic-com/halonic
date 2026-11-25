# search.palette

- Status: active
- Since: unreleased
- Source: HAL-18879 (click test step 6, HAL-18354); feature 14 of the HAL-17422 plan, approved by the board on HAL-10 (24 Nov)

When the person types in Ctrl K or on the Search page, the Search feature shall offer the agents, inbox items and work, such as a Paperclip's tasks, that `AgentMessaging` finds for the words, each named by its title, with its kind and its source's label as the detail ("Work · Paperclip · Acme"), and each opening the place that lists it: the Overview for an agent or work, the Inbox for an inbox item. It shall leave out chats and messages, which live in Messenger's own window. It shall ask nothing for blank words, and shall find nothing in a Studio with no source connected.

## Examples

- Given the task "Answer the click test" in "Paperclip · Acme",
  when the person types "click test" in Ctrl K,
  then a row "Answer the click test" shows with "Work · Paperclip · Acme", and picking it opens the Overview.
- Given an inbox item asking "Can Chief ship on Friday?",
  when the person types "chief",
  then its row opens the Inbox.
- Given a chat titled "Launch chat",
  when the person types "launch",
  then Ctrl K shows no row for it.
