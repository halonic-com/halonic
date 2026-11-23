# assistant.build.step-limit

- Status: active
- Since: unreleased
- Source: HAL-16795 (T14 PR 6a); req-assistant (HAL-110); flow-assistant 3.6 (HAL-647); states H28 (HAL-5896); microcopy 14.1 and 19.5 revision 117 (HAL-751, HAL-14707)

When the Build chat's answer stops at the chat's model call limit, the chat shall end the reply with "Stopped after *n* model calls. Ask it to continue." and **Continue**, announce that line, and show Send again. When the person clicks Continue, the chat shall ask the Assistant host to continue that answer without a new message, and the line shall go.

## Examples

- Given the answer stops at the limit of 16 model calls,
  then the reply ends with "Stopped after 16 model calls. Ask it to continue." and Continue.
- Given that reply, when the person clicks Continue,
  then the host is asked to answer in the chat with no message, and the line is gone while it answers.
