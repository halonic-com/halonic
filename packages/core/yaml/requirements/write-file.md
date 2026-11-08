# yaml.write-file

- Status: active
- Since: 0.1.0
- Source: HAL-111

When `writeYamlFile` writes data, the writer shall produce exactly the text the old app wrote for workspace files: the `yaml` library's `stringify` with a line width of 100.

## Examples

- Given a map with a list of step maps, when `writeYamlFile` runs, then it writes block style with two-space indents and `- ` items.
- Given the texts `"null"`, `"~"`, `"true"`, `"012"`, `"42"`, `"a: b"`, `"#c"`, `"- x"`, `""` and `" lead"`, when `writeYamlFile` runs, then each is double-quoted.
- Given the texts `yes`, `no`, `on` and `off`, when `writeYamlFile` runs, then they stay unquoted.
- Given text with line breaks, when `writeYamlFile` runs, then it writes a `|-` block, or `|` when the text ends in a line break.
- Given a long sentence, when `writeYamlFile` runs, then it folds at 100 columns.
- Given an empty list and an empty map, when `writeYamlFile` runs, then it writes `[]` and `{}`; a key whose value is `undefined` is left out.
- Given `undefined`, when `writeYamlFile` runs, then it throws an `AssertionError`.
