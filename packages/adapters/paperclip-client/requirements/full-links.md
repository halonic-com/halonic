# paperclip-client.full-links

- Status: active
- Since: unreleased
- Source: the board's direction on HAL-19357 (links in Messenger messages; until Studio has its own view for Paperclip's tasks, prepend the Paperclip host to relative links); task HAL-19407. Studio's own views are HAL-19408.

When the Paperclip provider hands a message's text, a card's question or an approval's question to the app, it shall turn every Markdown link whose target is a path from the root of Paperclip (it starts with one `/`, such as `[ACME-8](/ACME/issues/ACME-8)`) into a link to the connection's Paperclip address followed by that path, keeping the link's text, title and fragment.

The provider shall leave every other link as written: a full address, a target with any scheme (`javascript:` included), a target starting with `//` or `/\` (another host), and a target with no leading `/`. It shall leave text in code spans and fenced code blocks as written.

## Examples

- Given the connection to `https://paperclip.acme.test` and Ada's message "See [ACME-8](/ACME/issues/ACME-8).",
  when the app lists the chat's messages,
  then the message reads "See [ACME-8](https://paperclip.acme.test/ACME/issues/ACME-8).".
- Given links to `/ACME/approvals/<an approval's ID>` and `/ACME/agents/ada`,
  when the app reads them,
  then they point to the same paths on `https://paperclip.acme.test`.
- Given the links `[docs](https://docs.acme.test/start)`, `[evil](//evil.example/x)` and `[click](javascript:alert(1))`,
  when the app reads them,
  then they are unchanged.
- Given `` `[ACME-8](/ACME/issues/ACME-8)` `` in a code span or inside a fenced code block,
  when the app reads it,
  then it is unchanged.
