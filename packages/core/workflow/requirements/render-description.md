# workflow.render-description

- Status: active
- Since: 0.1.0
- Source: Liam's architecture decision on HAL-1218 (from the halonic#741 review, HAL-2560): a wait step's description is a template

When a step's description is filled in against a run's scope, the workflow rules shall split it before filling it in: the first line is the title, on one line, and lines 2 onward are the body, without blank lines at its start and end. Each placeholder shall be filled in as in `workflow.render-text`, so a placeholder that resolves to nothing gives empty text and never shows as `{{…}}`. Values are filled in as they are, with nothing escaped or formatted, so whoever shows them can show them as plain text.

## Examples

- Given Acme's review description `Approve this reply?`, `{{context.reply}}`, a blank line and a sample note, and `context.reply` "Hello Ada",
  when it is filled in,
  then the title is "Approve this reply?" and the body is "Hello Ada", a blank line and the note.
- Given the same description and a `context.reply` holding a Markdown link, an image and `<script>`,
  when it is filled in,
  then the body holds that text exactly as written.
- Given the same description and no `context.reply`,
  when it is filled in,
  then no `{{` is left: the reply's line is empty, and as it is at the start of the body, the body starts with the note.
- Given the description `Check order {{context.order}}` and an order that holds a line break,
  when it is filled in,
  then the title is on one line and the body is empty.
- Given a description with one line and no placeholder,
  when it is filled in,
  then the title is that line and the body is empty.
