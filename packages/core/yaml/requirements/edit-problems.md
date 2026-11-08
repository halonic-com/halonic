# yaml.edit-problems

- Status: active
- Since: 0.1.0
- Source: HAL-404

If the text can't be read, then `editYaml` shall return the problem `readYaml` gives for it. If an edit doesn't fit the data, then `editYaml` shall return a `bad-edit` problem with the index of that edit and one line saying why, and no result text: the caller's text stays as it was, even when earlier edits fitted. An edit doesn't fit when its path runs through text, a number or a boolean; uses a number on a map or text on a list; reaches past the end of a list; `set`s a list index that doesn't exist (the list's length says to use `insert`); creates a missing list; `insert`s where there is no list or the path doesn't end in an index; `delete`s `[]`; or gives a value YAML can't hold. A value YAML can't hold is anything `writeYamlFile` would reject or that wouldn't read back equal: `undefined` (also inside objects and lists), functions, symbols, bigints, class instances such as `Date` and `Map`, and data that contains itself. An edit that makes the result nest deeper or run longer than the limits passed to `editYaml` is a `bad-edit` too.

## Examples

- Given a text with a syntax error, when `editYaml` runs, then the problem is the same `syntax` problem `readYaml` gives.
- Given `name: Billing`, when `set ["name", "first"]` runs, then the problem says `"name"` holds text, not a map or a list.
- Given a list of two, when `set ["steps", 2]` runs, then the problem says to use insert.
- Given an empty text, when `set ["steps", 0, "id"]` runs, then the problem says `set` creates only maps.
- Given `delete []`, when `editYaml` runs, then the problem says to set `[]` to `{}` instead.
- Given values `undefined`, `{ a: undefined }`, `[undefined]`, a function, a symbol, `1n`, a `Date`, a `Map` and an object that contains itself, when `set` runs with each, then each is a `bad-edit`.
- Given three edits where the second doesn't fit, when `editYaml` runs, then the problem has `edit: 1`.
- Given a depth limit of 3, when `set` gives a value nested 4 levels, then the problem is a `bad-edit`.
- Given a length limit just above the text's length, when `set` adds a long text, then the problem is a `bad-edit` that names the limit.
