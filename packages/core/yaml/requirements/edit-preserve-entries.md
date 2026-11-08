# yaml.edit-preserve-entries

- Status: active
- Since: 0.1.0
- Source: HAL-404

When `editYaml` applies a `delete` or an `insert`, or a `set` of a whole map or list that removes keys or changes how many items a list has, the layer shall change only the lines of the entries it removes or adds, and keep every other character. New list items shall be written at their list's indent, with text quoted by the `yaml` library as `writeYamlFile` would. A new list item shall go above the comment lines right over the item it is inserted before. A deleted entry shall take its own lines with it, including a comment on its last line, and leave the comments above it. When blank lines sat on both sides of a deleted entry, one of them shall go too. When the last entry of a map or list is deleted, `{}` or `[]` shall remain, with the comment lines that sat right above that entry under it; when another comment would go with it, the edit shall fall back instead. Such an edit shall say the layout `kept`.

## Examples

- Given `steps:` with a comment over its first item, when `insert ["steps", 0]` runs, then the new item sits above the comment.
- Given `a: 1`, `# about b`, `b: 2 # gone` and `c: 3`, when `delete ["b"]` runs, then `# about b` stays and `b: 2 # gone` goes.
- Given `a`, `b` and `c` separated by blank lines, when `delete ["b"]` runs, then `a` and `c` stay one blank line apart.
- Given a list with one item, when the item is deleted, then the list reads `[]`.
- Given `a:` with a comment over its only key `x`, when `delete ["a", "x"]` runs, then `a: {}` stays with the comment under it.
- Given a list of two items with a comment on the first, when `set` gives it a third item or only the first, then the first item's line stays.
- Given each of the 20 example files at `784f78d`, when each top-level key is deleted, then the layout is `kept`, the data is right and only that key's lines are gone.
