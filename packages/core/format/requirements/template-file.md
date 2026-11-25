# format.template-file

- Status: active
- Since: unreleased
- Source: HAL-18141 (plan on HAL-17956, PR 2)

When `parseFile` reads a template (`library/templates/<id>.md` at the workspace root), the format shall take optional YAML front matter with a `title` (1 to 80 characters, no hidden marks), drop other front matter keys, use the file name as the id (at most 64 characters), and keep the Markdown after it as the body, or the whole file when it has no front matter, trimmed either way. It shall read Windows line breaks as `\n`, and refuse a file over 64 KiB, an empty body, a body over 32,000 characters, a body with a hidden mark other than a line break, and a key in the title or body (`value-looks-like-key`). A template is text only: no setting in it changes what an agent may do.

## Examples

- Given front matter `title: Task with Done when` and a body, when `task-spec.md` is parsed, then the value is `{ id: task-spec, title, body }` with the body trimmed.
- Given `## Summary` with Windows line breaks and no front matter, when `pr-body.md` is parsed, then the body is the whole text, trimmed, with `\n` line breaks.
- Given front matter and no body, when it is parsed, then it fails with `too_small` at `body`.
- Given a zero-width space or an Anthropic key in the body, when it is parsed, then it fails at `body`, the key with `value-looks-like-key`.
