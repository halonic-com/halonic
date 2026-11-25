# paperclip-client.full-answers

- Status: active
- Since: unreleased
- Source: plan "Messenger live replies" (HAL-18743, sections 3.3, 3.4 and 5.3), approved by the board on 25 Nov at 18:46; task HAL-18756, design approved by Liam on the task

When an agent's comment on a chat task links that same chat task's `full-answer` document, by the task's ID or its identifier, the Paperclip provider shall give that message the document's key, title and Markdown as its `fullAnswer`. The provider shall read that one document at most once per list of the chat's messages, only when such a link is there, and shall read no other document of the task. It shall give no `fullAnswer` to the person's own comments, to automatic notes, to a link to another task's document or to another document key, or for a document that isn't Markdown or is larger than 64 KB.

If reading the full answer fails for any reason other than its not being there, then the provider shall still list the chat's messages, without `fullAnswer`, and shall report the failure through its `warn`, never with a document's text. A provider given no `warn` shall fail the list instead.

## Examples

- Given Ada's reply "0.3 is ready. [Details](/ACME/issues/ACME-8#document-full-answer)" on chat task ACME-8, which has the document `full-answer` titled "Release 0.3",
  when the provider lists the chat's messages,
  then that reply has the full answer `full-answer`, "Release 0.3", with the document's text.
- Given the same reply linking `/ACME/issues/ACME-7#document-full-answer`, another task's document,
  when the provider lists the chat's messages,
  then the reply has no full answer.
- Given Paperclip answers the documents read with an error,
  when the provider lists the chat's messages,
  then they are listed without a full answer and the failure is reported.
