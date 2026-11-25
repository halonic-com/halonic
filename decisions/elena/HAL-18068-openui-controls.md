# Decision: chat replies get buttons and a form that send a message

- Approval: HAL-17107 (the board approved the OpenUI plan on 23 Nov and its look on 24 Nov); built on HAL-18068; the reviewer signs this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:WxSaaSf5LQZdM20uXRWPHrWePvGTO9154497MiclZR6yRPxBKfbiG94fCiF7QICDVTdBvaG+AiNF1L9vjstvBg==

## What changes

- `kit.chat-ui`: the kit's `ChatUi` also draws an agent's buttons and form. A button looks like a
  small `secondary` button with no icon, never like the approval button, and a click sends its
  words through the new `onSend` prop, with "A button sends its words as your message." under the
  row. A form sends one message: the send button's words, then `Label: answer` per field, a tick
  box as `yes` or `no`, with "Sends your answers as your message." under its send button. Without
  `onSend` the buttons and the form's send button are unavailable.
- One example is added for the form. The existing text and examples for cards, tables, links,
  images and the "couldn't be shown" line stay as they were; no test or example is weakened.

## Why

The approved OpenUI plan splits Part A into A4 (cards and tables, HAL-17648, merged as #5894) and
A4b (this change), so the requirement HAL-17648 added grows to cover the two parts that send a
message. The words under the controls are the HAL-17107 design's, word for word.

## Covers

- kit.chat-ui
