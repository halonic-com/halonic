# quick-ask.automatic-notes

- Status: active
- Since: unreleased
- Source: HAL-19821, after the board's check of quick ask on Windows (HAL-19376); automatic notes as Messenger treats them (`messenger.automatic-notes`)

The Quick Ask feature shall not take a message its source marks `automatic`, such as Paperclip's fast-response receipt, for the agent's answer: while only such notes came after the question, the box shall keep saying the agent is working or that the answer comes to the chat, and shall offer neither **Copy** nor **Open in Messenger**. The next opening shall not offer such a note as the last answer. When the agent's own message comes, the box shall show it and offer **Copy** and **Open in Messenger**.

## Examples

- Given a question sent to Chief and the box open,
  when Paperclip's receipt "On it." arrives in Chief's name,
  then the box still shows the hints and no Open in Messenger.
- Given the receipt in the chat,
  when Chief's own reply arrives,
  then the box shows the reply with Copy and Open in Messenger.
