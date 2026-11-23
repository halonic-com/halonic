# Decision: chat replies show Markdown, with the plugin Markdown reader moved into the kit

- Approval: HAL-17070 (build task), from Noah's spec on HAL-17068, decided by the team (no board card: it reuses the approved chat reply and plugin Markdown looks)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:shcNfrJTcvjR8XwnaXASy02cXdIFbf5WUl/4jOi2hozTGSPRzyMAx38co7ChNv7fdoZVgwXP8Hh58Aske5/gAw==

## What changes

`kit.chat-message` gets one more sentence and three examples: `ChatText` shows the Markdown a
reply may use (bold, italic, inline code, code blocks, lists, quotes, and headings as a bold line),
shows every link as its words followed by its address, as text that opens nothing, and shows any
other Markdown, HTML and images as written. Nothing in the old text is removed.

The Markdown reader moves, unchanged apart from its type names and one new field, from
`packages/studio/features/plugins/src/text/markdown.ts` to
`packages/studio/kit/src/text/markdown.ts`, with its test. So
`packages/studio/features/plugins/src/text/markdown.test.ts` is deleted, and the same tests, with
the same `expect` calls and still under `plugins.plugin-text`, run from
`packages/studio/kit/src/text/markdown.test.ts`. The reader's list block gains `start`, the first
item's number; the three list results in that test name it (`start: 1`), and one new test checks a
list that starts at 3.

`PluginResult` passes that number to `<ol start>`, so its never-HTML test allows the `start`
attribute. The reader writes it from the digits it read, never from the answer's text, so no
plugin string can reach it. One `kit.chat-message` test now looks for `whitespace-pre-line` on
the paragraph inside `ChatText` rather than `whitespace-pre-wrap` on its outer element, which is a
`div` now because a list or a code block can't sit inside a `<p>`.

## Why

Chat replies in the Assistant panel and in Try it showed `**`, backticks and `-` as raw
characters. Both draw text through the kit's `ChatText`, and the kit may depend on no other Studio
package, so the reader had to move into the kit rather than be copied or imported from the plugins
feature. Links stay text because a model's words can say one place and go to another (HAL-17068,
section 2).

## Covers

- kit.chat-message
- plugins.plugin-text
- packages/studio/features/plugins/src/text/markdown.test.ts
