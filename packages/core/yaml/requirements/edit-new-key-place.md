# yaml.edit-new-key-place

- Status: active
- Since: 0.1.0
- Source: HAL-3278, so "Undo this change", and Accept and Reject of one change, put a removed step or field back where it was in the other version of the file

When a `set` adds a key that its map doesn't have yet and names a sibling key in `after`, `editYaml` shall put the new key's lines right after that sibling's entry; with `after: null` it shall put them first in the map, above the comment lines over the first entry; and when `after` names a key the map doesn't have, or there is no `after`, it shall put them at the end. A `set` of a key that is already there shall stay where it is.

## Examples

- Given `states:` with `read`, `classify` and `draft`, when `set ["states", "triage"]` runs with `after: "read"`, then `triage` sits between `read` and `classify`, and every other line is unchanged.
- Given `id: x` with the comment `# the id` above it, then `name: X`, when `set ["model"]` runs with `after: null`, then `model` is the first line, above `# the id`.
- Given `after: "missing"`, when the new key is set, then it goes at the end of the map.
- Given `name: X`, when `set ["name"]` runs with `after: null`, then `name` stays where it is with its new value.
- Given a text with mixed line endings, where the edit is written through the parsed document, when `set ["b"]` runs with `after: "a"`, then `b` still sits right after `a`.
- Given `env: {A: 1, C: 3}` in flow style, when `set ["env", "B"]` runs with `after: "A"`, then `B` sits between `A` and `C`.
- Given a file written again from its data (the `rewritten` layout), when the new key is set with `after`, then it is in the same place there too.
