# assistant.build.site-card

- Status: active
- Since: unreleased
- Source: HAL-18451 (I4b PR 2b, plan rev 2 on HAL-18271, sections 2.1 to 2.3); `assistant.build.read-docs` (HAL-18398)

The Build chat shall show, under each `read_docs` call, that call's line from the chat's docs log, such as "Read https://docs.example.com/api, 12 KB"; a line for a page it didn't read says why in words, never with a status alone, and never shows where a `3xx` pointed. When that call asked about a site, it shall also show the site card: an `article` named by its question "Read docs from *host*?" with the exact host, the line that allowing lets the assistant read pages from this site for the rest of this chat, and **Allow** and **Don't allow** while the site waits for an answer. **Allow** shall answer `allowed` and **Don't allow** `declined` for that card, and once answered, the card shall show the answer in place of its buttons. When saving the answer fails, the card shall keep its buttons and say "Couldn't save your answer: *reason*.", with the shell's failure line; a card already answered elsewhere (`conflict`) shall show the kept answer instead, without an error.

When the answer came from the card's own button, focus shall move to that answer. Once the site has an answer, the call's line that waited for it shall no longer show, so the log never contradicts the card. A failure to save the answer shall show under the buttons as an error line with its alert icon, and the buttons shall stay.

## Examples

- Given a chat whose `read_docs` call `d1` asked about `docs.example.com`,
  when the chat shows,
  then the call's line says it waits for an answer, and the card under it asks "Read docs from docs.example.com?" with **Allow** and **Don't allow**.
- Given that card,
  when the person clicks **Allow**,
  then the host records `allowed` for card `d1`, the card says "Allowed for this chat." without its buttons, that line has focus, and the call's waiting line is gone.
- Given that card,
  when the person clicks **Don't allow**,
  then the host records `declined` for card `d1`, and the card says "Not allowed in this chat.".
- Given that card, answered as `allowed` in another window,
  when the person clicks **Don't allow**,
  then the host refuses it as `conflict`, and the card says "Allowed for this chat." without an error.
