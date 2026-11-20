# yaml.edit-rename

- Status: active
- Since: unreleased
- Source: HAL-13915, so renaming a step in the Studio's step card keeps the comments a person wrote inside that step

When `editYaml` applies a `rename` with a `path` that ends in a map key and a new name `to`, the layer shall give that key the name `to` in the same place in its map, with the same value. When the splice can do it, only the key's characters shall change, so its value, the comments inside and around it and every other line stay byte for byte, and the layout shall be `kept`. A quoted key shall keep its quote style; a plain key shall get quotes when `to` needs them to read back as the same text. When the splice can't do it, the edit shall fall back to the `reformatted` and then the `rewritten` layout like any other edit, keeping the key's place. A `rename` with `to` equal to the old key shall change no character. If the `path` doesn't end in a map key, or no key is at `path`, or `to` is already a key of that map, then `editYaml` shall return a `bad-edit` problem.

## Examples

- Given `states:` with `write` and `send`, and comments above, on and inside `write`, when `rename ["states", "write"]` to `draft` runs, then only `write` becomes `draft` and the layout is `kept`.
- Given `a: 1`, when `rename ["a"]` to `yes`, `1`, `a: b` or the empty text runs, then the new key reads back as that same text.
- Given `"a": 1`, when `rename ["a"]` to `c` runs, then the key is written `"c"`.
- Given `env: {A: 1, C: 3}` in flow style, when `rename ["env", "A"]` to `B` runs, then it gives `env: {B: 1, C: 3}`.
- Given a text with mixed line endings, when `rename` runs, then the key keeps its place and its comment, and the layout is `reformatted`.
- Given a key with no text (`: 1`), when `rename [""]` runs, then the layout is `rewritten`.
- Given `a: 1`, when `rename ["a"]` to `a` runs, then the text is unchanged.
- Given `a: 1` and `b: 2`, when `rename ["a"]` to `b` runs, then the problem says `"b"` is already a key.
- Given `a: [1]`, when `rename ["a", 0]` or `rename ["a", "x"]` runs, then the problem says the path must end in a map key.
- Given `a: 1`, when `rename ["b"]` or `rename ["x", "b"]` runs, then the problem says there is no key to rename.
