# yaml.position-of

- Status: active
- Since: 0.1.0
- Source: HAL-111, ported from `sourcePosition` in the old app

When a path of keys and list indexes is given, `positionOf` shall return the 1-based line and column where the value at that path starts; where nothing sits at the path, it shall return the position of the nearest parent that exists, and `undefined` only for a file with no data.

## Examples

- Given `steps:` with `- id: check` on line 3, when `positionOf(["steps", 0, "id"])` runs, then it returns line 3, column 9.
- Given a flow list `tools: [mail, ledger]` on line 7, when `positionOf([..., "tools", 1])` runs, then it returns the column of `ledger`.
- Given a step map without a `model` key, when `positionOf([..., "model"])` runs, then it returns where that step map starts.
- Given a path into a list item that does not exist, when `positionOf` runs, then it returns where the list starts.
- Given the empty path, when `positionOf([])` runs, then it returns line 1, column 1.
- Given a file with only a comment, when `positionOf(["name"])` runs, then it returns `undefined`.
- Given Windows line endings, when `positionOf` runs, then lines are counted as with `\n`.
