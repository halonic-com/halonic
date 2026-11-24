# assistant.chat.key-in-message

- Status: active
- Since: unreleased
- Source: HAL-16797 (T14 PR 7); states H29 (HAL-5896); flow-assistant 5.9 (HAL-647); HAL-1625; HAL-1844; the T14 plan, Q4 (HAL-1307, HAL-16788)

When the person sends a Build chat message that holds text shaped like a key (`findSecretShape` in `@halonicjs/std`, the check the Try it chat and the Inbox use), the chat shall not hand it to the host, so it is neither sent to the model nor kept in the chat's history, keep it in the box, and show under the box, in `warning`, "This looks like an API key. Keys go in the key field, so they stay out of chats and files." with **Go to the key field ›**, which opens the workspace's Models, where keys are kept, and **Send anyway**, which sends the message once as it is and puts focus in the box. The line shall go when the text changes.

## Examples

- Given the person sends "My key is sk-ant-…" with 24 more letters and digits,
  then nothing is sent, the text stays, and the key line shows.
- Given that line, when they click Send anyway,
  then the message is sent once, as it is, and the box is empty.
- Given "my key starts with sk-abc", when they press Send,
  then it is sent.
