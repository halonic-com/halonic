# yaml.edit-style

- Status: active
- Since: 0.1.0
- Source: HAL-404

When `editYaml` writes new block lines, the layer shall indent them the way the file does: the indent width of the first map under a key, and for a list under a key whether its `-` sits at the key's column or further in. A file without such a map or list shall get the `writeYamlFile` style (2 spaces, lists indented). The `yaml` library can only put a list's `-` at its key's column when the indent width is 2: with a wider indent, a file whose lists sit at the key's column gets new lists with the `-` the width minus 2 columns further in (2 columns for a 4-space file). When an edit lands inside a list or map written in flow style on one line, like `[a, b]`, the layer shall write that collection again on the same line, with spaces inside its brackets when it had them, and keep every other character (layout `kept`). A set of one scalar in it shall change only that scalar's characters when that reads back right, also when the collection spans several lines. Any other edit to a flow collection over several lines, or one whose new value needs more than one line, shall fall back to rendering the parsed document again (layout `reformatted`).

## Examples

- Given a file indented with 4 spaces, when a map is set under a new key, then its keys are 4 spaces in.
- Given `steps:` with its `- ` items at the key's column, when a list is set under a new key, then its `- ` items sit at that key's column too.
- Given a file indented with 4 spaces whose `- ` items sit at the key's column, when a list is set under a new key, then its `- ` items sit 2 columns in.
- Given `tools: [a, b] # the tools`, when `set ["tools", 0]` to `c` runs, then the text is `tools: [c, b] # the tools` and the layout is `kept`.
- Given `tools: [ a, b ]`, when `insert ["tools", 2]` of `c` runs, then the text is `tools: [ a, b, c ]`.
- Given `tools: [a, b]`, when `set ["tools", 0]` to `x, y` runs, then the text is `tools: ["x, y", b]`.
- Given `tools: [a,` and `b]` on two lines, when an item is set, then only its characters change; when an item is inserted, then the layout is `reformatted` and the data is right.
