# plugins.plugin-text

- Status: active
- Since: 0.1.0
- Source: HAL-1740; ADR `docs/adr/2026-11-09-plugins.md` section 5; [plugin screens](/HAL/issues/HAL-1739#document-design) section 8.4; [UX acceptance for P7](/HAL/issues/HAL-1952#document-ux-acceptance) section 1

The Studio shall show a plugin tool's answer the way its command or card says, `text`, `markdown` or `table`, and shall never turn any of it into HTML or script. `text` is plain text with its line breaks. `markdown` reads only paragraphs, headings (drawn as a bold line), bullet and numbered lists, quotes, code, bold, italics and links; an image, HTML and a link to anything but an `http` or `https` page stay as their own characters. A link opens through `ExternalLink` and shows its full address on hover. `table` reads a JSON list of objects, one row each, with a column for every key in the order it first appears; an answer that isn't such a list shows as plain text.

## Examples

- Given a `markdown` answer `<b>bold</b> <script>alert(1)</script>`,
  when Studio shows it,
  then the text reads exactly that, angle brackets included, and the page has no `b` or `script` element.
- Given a `markdown` answer `[link](javascript:alert(1))`,
  when Studio shows it,
  then it reads `[link](javascript:alert(1))` as text, with no link.
- Given a `markdown` answer `See [the map](https://example.com/map)`,
  when Studio shows it,
  then "the map" is an `ExternalLink` to `https://example.com/map` that shows that address on hover.
- Given a `table` answer `[{"day":"Mon","high":21},{"day":"Tue","rain":true}]`,
  when Studio shows it,
  then it is a table with the columns day, high and rain, and two rows.
- Given a `table` answer `It's sunny`,
  when Studio shows it,
  then it reads `It's sunny` as plain text.
