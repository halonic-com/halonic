# agents.chat.box-lines

- Status: draft
- Since: unreleased
- Source: HAL-13177; flow-agents 4.4; microcopy 8.3; states (HAL-5896) section 4, H27 and H29; harness-states rule 1; UX checklist part 2, section 6 (a key in a Try it message), HAL-1625, HAL-1844

When the person sends a Try it message that holds text shaped like a key (`findSecretShape`), the chat shall not send it, keep it in the box, and show under the box, in `warning`, "This looks like an API key. Keys go in the key field, so they stay out of chats and files." with **Go to the key field ›**, which opens where keys are kept, and **Send anyway**, which sends the message once as it is; the line shall go when the text changes. When the agent's harness isn't installed or is too old, the chat shall show under the box "*Sorter* can't run until *Claude Code* is installed." or "…is updated." with **Open Harness settings ›**, and Send shall wait with that line as its reason. Of these lines it shall show one at a time: the held message first, then the harness in harness-states rule 1's order.

## Examples

- Given the person sends "My key is sk-…" with 24 more letters and digits,
  when they press Send,
  then nothing is sent, the text stays and the key line shows.
- Given that line,
  when they click Send anyway,
  then the message is sent once, as it is.
- Given "my key starts with sk-abc",
  when they press Send,
  then it is sent.
- Given an agent on Claude Code that isn't installed,
  when its chat shows,
  then the line reads "Sorter can't run until Claude Code is installed." and Send waits with it as its reason.
