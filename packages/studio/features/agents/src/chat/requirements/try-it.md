# agents.chat.try-it

- Status: draft
- Since: unreleased
- Source: HAL-13177; flow-agents 4.1, 4.2 and 4.4; microcopy 8.3 and 19.5; states (HAL-5896) section 4, H2, H9, H10; UX checklist 9.4 and 9.5

The agents feature shall give an agent a Try it chat. With no message yet, it shall show "Chat with *Sorter*" with the agent's description under it, and a box named "Message *Sorter*" with the placeholder "Message *Sorter*…". When the person sends a message, the chat shall show it, clear the box, and ask the agents host to answer it with the whole conversation so far, outside any run, and it shall build the reply step by step from what the host's listener hears: each text the model writes, and each tool call as one line ("Using *send reply*…", then "Used *send reply*", or "*Send reply* didn't work"), the tool named in words without its connector. Each reply shall start with the hidden heading "*Sorter* said". While a reply is being written, **Stop** shall take Send's place; Stop shall end the reply with "Stopped by you.". When a reply ends, the chat shall announce once "*Sorter* replied.", "Stopped by you.", or a failure assertively, and nothing while the reply streams in. A Try it reply shall have no run line and no link to a run.

## Examples

- Given the agent Sorter with the description "Sorts incoming mail by topic" and no message,
  when its chat shows,
  then it reads "Chat with Sorter", "Sorts incoming mail by topic" and the box "Message Sorter…".
- Given the person sends "Sort this mail" and the agent calls `acme-mail__read_mail`, then answers "It's about a refund.",
  when the reply ends,
  then the transcript shows "Sort this mail", "Used read mail" and "It's about a refund.", and "Sorter replied." is announced.
- Given a reply being written,
  when the person clicks Stop,
  then the reply ends with "Stopped by you.", which is announced.
