# kit.chat-message

- Status: active
- Since: unreleased
- Source: HAL-13177; flow-agents 4.2 and 4.4; microcopy 19.5 (each reply's hidden heading); HAL-11705; HAL-17068 (Markdown in replies)

The kit's `ChatMessage` shall show a message the person sent on the right, in a bubble of the own-message colour (`surface-own-message`), and a reply across the column under a heading that only screen readers get, such as "Sorter said", at level 3 unless the feature sets another. A reply shall show its steps in the order given. The kit's `ChatText` shall show one text step in `text-reading`. Both shall keep the text's line breaks and wrap a long word rather than cut it. `ChatText` shall show the Markdown a reply may use (bold, italic, inline code, code blocks, lists, quotes, and headings as a bold line) and shall show every link as its words followed by its address, as text that opens nothing. Any other Markdown, HTML and images shall show as written.

## Examples

- Given a ChatMessage from "you" with "Sort this mail",
  when it renders,
  then the text shows in a box at the right.
- Given a ChatMessage from "reply" with the heading "Sorter said" and a text step,
  when it renders,
  then a visually hidden level 3 heading "Sorter said" comes before the text.
- Given a ChatText with "I added **morning-sort**",
  when it renders,
  then "morning-sort" shows in bold with no stars.
- Given a ChatText with "[guide](https://example.com)",
  when it renders,
  then it shows "guide (https://example.com)" and no element in it opens anything.
- Given a ChatText with `<img src=x>` or `![x](https://example.com/x.png)`,
  when it renders,
  then those characters show and nothing loads.
