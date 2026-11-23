# agents.chat.streaming

- Status: draft
- Since: unreleased
- Source: HAL-17115; streaming plan (HAL-17106, approved on HAL-17113); a11y A6; HAL-17070 (Markdown in replies)

While a Try it reply is being written, the chat shall show the text the model writes as it comes, after the reply's steps so far, through the same text step as a finished reply, drawing it at most once per animation frame. When the model starts its text again, the chat shall drop the text shown so far. When the turn's message arrives, its text shall replace the text written so far. Bold, italic, inline code and a link that aren't closed yet shall show as written until they close; a code block shall show as one while it fills. When a reply is stopped or fails while its text is being written, the text written so far shall stay, followed by the line the reply ends with. The text written so far shall never join the conversation the next message sends. The reply shall be `aria-busy` until it ends, and nothing shall be announced while it is written. A reply on an engine that doesn't stream shall appear whole, as before.

## Examples

- Given a reply being written,
  when the model writes "It's ", "about " and "a refund" in one frame,
  then the reply shows "It's about a refund" once, is `aria-busy`, and nothing is announced.
- Given a reply that shows "Refu",
  when the model starts again and writes "Billing",
  then the reply shows "Billing".
- Given a reply that shows "I added **morn",
  when the model writes "ing-sort**",
  then "morning-sort" shows in bold.
- Given a reply that shows "It's about",
  when the person clicks Stop,
  then the reply shows "It's about" and then "Stopped by you.".
