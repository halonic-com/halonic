# yaml.edit-preserve

- Status: active
- Since: 0.1.0
- Source: HAL-404

When `editYaml` applies a `set`, the layer shall change only the text of the value or key it touches, and keep every other character: comments, key order, quoting, blank lines and a byte order mark. A `set` that gives the value already there shall change nothing. A `set` of a whole map or list shall change only the keys and items whose values differ. New keys shall be written at their map's indent, with keys and text quoted by the `yaml` library as `writeYamlFile` would. A one-line text that was quoted shall keep its quote style. Where the splice can't keep the layout, the edit shall fall back to rendering the parsed document again (layout `reformatted`, comments kept), then to `writeYamlFile` (layout `rewritten`, comments lost), and the result shall say which.

## Examples

- Given `name: Billing # shown in the list`, when `set ["name"]` to `Invoices` runs, then the text is `name: Invoices # shown in the list` and the layout is `kept`.
- Given `q: 'it'`, when `set ["q"]` to `it's` runs, then the text is `q: 'it''s'`.
- Given a step map, when `set` gives the same map with one field changed, then only that field's line changes.
- Given `# top`, `a: 1 # c` and `b: 2`, when `set []` to `{ a: 1, b: 3, d: 4 }` runs, then `a: 1 # c` stays, `b` reads `3`, `d: 4` is added at the end and the layout is `kept`.
- Given a `|` block text, when `set` gives another text with line breaks, then it stays a `|` block.
- Given each of the 20 example files at `784f78d`, when every leaf is set to itself, then no byte changes; when each leaf is set to a new value, then the layout is `kept`, the data is right and only the leaf's lines change.
- Given random data written with `writeYamlFile` and a comment on every line, also with Windows line endings, when a leaf is set, then only the leaf's line changes.
- Given a value inside a flow list `[a, b]`, when it is set, then the layout is `reformatted` and the data is right.
