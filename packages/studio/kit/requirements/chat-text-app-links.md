# kit.chat-text-app-links

- Status: active
- Since: unreleased
- Source: HAL-19403; HAL-19357 (the board's report on HAL-10: links in Messenger don't show); ADR 2026-11-24 agent messaging, agent-written content

The kit's `ChatText` shall read a Markdown link whose address is a task, an approval or an agent in Studio (`/<company>/issues/<id>`, `/<company>/approvals/<id>` or `/<company>/agents/<id>`, where the company and the id are letters, digits, `-` and `_`, with an optional `#part` of the same characters) as an app link, inside bold, italic, quotes and list items as anywhere else. In place of `kit.chat-message`'s words followed by an address, it shall show only the app link's words. Where a feature gives `ChatText` an `openAppLink` function, the words shall be a button in the inline link style whose click calls `openAppLink` with the path; without it, they shall be text that opens nothing. A web link shall keep `kit.chat-message` and `kit.chat-text-links` unchanged, and any other address, such as `javascript:`, `data:`, `//host` or another path, shall still show as written.

## Examples

- Given a ChatText with `openAppLink` and "Done in [ACME-42](/ACME/issues/ACME-42).",
  when the person clicks "ACME-42",
  then `openAppLink` is called with "/ACME/issues/ACME-42".
- Given a ChatText without `openAppLink` and "[the approval](/ACME/approvals/7f3a)",
  when it renders,
  then it shows "the approval" as text and nothing in it is a button or a link.
- Given a ChatText with `openAppLink` and `[x](javascript:alert(1))`, `[x](data:text/html,hi)` or `[x](/ACME/settings)`,
  when it renders,
  then those characters show and nothing in it is a button or a link.
