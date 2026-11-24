# kit.chat-text-links

- Status: active
- Since: unreleased
- Source: HAL-17499; the #5628 review (HAL-17476); ADR 2026-11-24 agent messaging, agent-written content; HAL-17436 finding 3

Where a feature gives the kit's `ChatText` an `openLink` function, `ChatText` shall draw each web link in the Markdown as an `ExternalLink` with the link's words, still followed by its full address, and a click on it shall call `openLink` with the address instead of navigating the window. A `javascript:` link, raw HTML and images shall still show as written, and no image shall load. Without `openLink`, `ChatText` shall keep showing every link as text that opens nothing (`kit.chat-message`).

## Examples

- Given a ChatText with `openLink` and "See [the PR](https://example.com/pr/1).",
  when the person clicks "the PR",
  then `openLink` is called with "https://example.com/pr/1" and the window doesn't navigate.
- Given a ChatText with `openLink` and `[x](javascript:alert(1))` or `<script>alert(1)</script>`,
  when it renders,
  then those characters show and nothing in it is a link.
- Given a ChatText with `openLink` and `![x](https://example.com/x.png)`,
  when it renders,
  then those characters show and no image loads.
