# format.workspace-template-file

- Status: active
- Since: unreleased
- Source: HAL-19432 (design `template-design` on HAL-19432, reviewed by Liam)

When `parseFile` reads a workspace template (`template.yaml` at a workspace's root), the format shall take `version`, an `id` of the form `publisher/name` (each part lower-case letters, digits, `-` or `_`), a `title` (1 to 80 characters), a `summary` (1 to 200 characters), a `kind` of `demo` or `starter`, and `tryFirst`, at most 10 entries of a workflow id, an optional `input` path and a `hint` (1 to 200 characters), empty by default. It shall refuse a file over 16 KiB, any other field, hidden marks in the title, summary or hints, a key in the summary or a hint (`value-looks-like-key`), and an `input` that is absolute, uses `\`, or has `.`, `..` or empty parts. The template has no place in the workspace loader, so a template that fails never fails the workspace. Everything in it is a claim anyone can write: it may only change what is shown or which file a copy suggests, never what is reset, deleted, run or trusted.

## Examples

- Given the Acme demo's `template.yaml`, when it is parsed, then the value has `id: halonic/acme-demo`, `kind: demo` and one `tryFirst` entry for `support-reply`.
- Given only `id`, `title`, `summary` and `kind`, when it is parsed, then `tryFirst` is `[]` and `version` is 1.
- Given `id: acme`, or `id: Halonic/Acme`, when it is parsed, then it fails at `id`.
- Given `kind: hub`, or a field `flows`, when it is parsed, then it fails.
- Given an `input` of `/etc/passwd` or `../secret.json`, when it is parsed, then it fails at `tryFirst[0].input`.
- Given a zero-width space in a hint, or an Anthropic key in the summary, when it is parsed, then it fails at that field.
