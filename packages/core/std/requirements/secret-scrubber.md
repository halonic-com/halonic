# std.secret-scrubber

- Status: active
- Since: 0.1.0
- Source: HAL-2224 (cli-output 1.3 rule 5: `--debug` prints a bug's message and stack with secrets scrubbed)

When a `SecretScrubber` has been told a non-empty secret with `remember`, `scrub` shall replace every copy of that secret in a text with `[secret removed]`: the value as it is, URL-encoded with upper- or lowercase escapes, form-encoded, and JSON-escaped with `/` as it is or as `\/`. Where copies touch or overlap, they shall become one `[secret removed]`, and the scrubber shall not find a secret inside a `[secret removed]` it wrote. It shall ignore an empty secret, and leave text that holds no remembered secret as it is.

`secretTextForms` shall list those forms for one value, so a package that matches secrets in another way (bytes, streams) finds the same copies.

## Examples

- Given a remembered secret, when an error message quotes it twice, then both copies become `[secret removed]`.
- Given the secret `p@ss word/(1)!`, when a text holds it URL-encoded, form-encoded or JSON-escaped, then that copy becomes `[secret removed]`.
- Given a secret that holds a line break, such as a PEM key, when a text holds it whole, then it becomes one `[secret removed]`.
- Given the secrets `inner-42` and `outer-inner-42-tail`, in either order, when a text holds both, then each becomes one `[secret removed]`, and no `outer-` or `-tail` is left.
- Given the secrets `xab1` and `ab1cd`, when a text holds `xab1cd`, then it becomes one `[secret removed]` and no part of either secret is left.
- Given the secrets `made-up-token` and `e`, when a text holds `made-up-token e`, then it becomes `[secret removed] [secret removed]`, with no secret found inside the first marker.
- Given an empty secret, then `scrub` returns the text as it is; given the secret `b`, then `abc` becomes `a[secret removed]c`.

## Why every short secret too

A one-letter secret makes the scrubbed text hard to read, but leaving it in would leak it. Scrub a
whole text before splitting it into lines, so a secret that holds a line break is still found.
