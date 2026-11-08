# yaml.edit-line-endings

- Status: active
- Since: 0.1.0
- Source: HAL-404

When `editYaml` writes new lines into a text whose line breaks are all `\r\n`, the layer shall end them with `\r\n` too, and keep every other character, so the result has only `\r\n` line breaks and can say the layout `kept`. In a text whose line breaks are all `\n`, or that has none, new lines shall end with `\n`. When a text mixes line endings, an edit that changes it shall fall back to rendering the parsed document again (layout `reformatted`), which writes `\n`. A `reformatted` text from a text with only `\r\n` line breaks shall keep `\r\n`.

## Examples

- Given `a: 1` and `b: 2` with `\r\n` line breaks, when `set ["c"]` to `3` runs, then `c: 3` is added with `\r\n` and the layout is `kept`.
- Given a list with `\r\n` line breaks, when `insert` and `delete` run, then every line break is still `\r\n` and the layout is `kept`.
- Given `a: 1` with `\r\n` and `b: 2` with `\n`, when `set ["c"]` to `3` runs, then the layout is `reformatted` and the data is right.
- Given a flow list `[x]` in a text with `\r\n` line breaks, when its item is set, then the layout is `reformatted` and every line break is still `\r\n`.
- Given random data written with `writeYamlFile` with `\r\n` line breaks, when any fitting edit is spliced, then the text has no `\n` without a `\r` before it.
