# assistant.chat.stop

- Status: active
- Since: unreleased
- Source: HAL-16795 (T14 PR 6a); req-assistant (HAL-110); flow-assistant 2.2 and 5.1 (HAL-647); states H10 (HAL-5896); microcopy 14.1 (HAL-751)

While the Build chat is answering, the chat shall show **Stop** in Send's place, and Enter shall send nothing and keep the text. When the person clicks Stop, the chat shall stop the answer, end the reply with "Stopped by you.", announce it, show "Stopped by you" in the status line until the next message, and show Send again. A chat that was answering as Halonic closed shall end its last reply with "Stopped when Halonic closed.".

## Examples

- Given the Build chat is answering, when the person clicks Stop,
  then the answer's signal is aborted, the reply ends with "Stopped by you." and Send is back.
- Given the Build chat is answering and the person typed "Also add a test",
  when they press Enter, then nothing is sent and the text stays.
- Given a chat that was answering as Halonic closed, when the panel shows it,
  then its last reply ends with "Stopped when Halonic closed.".
