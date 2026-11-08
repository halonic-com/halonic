# yaml.edit

- Status: active
- Since: 0.1.0
- Source: HAL-404

When `editYaml` applies a list of `set`, `delete` and `insert` edits to a YAML text, the layer shall return a text that `readYaml` reads as the data with those edits applied in order, each edit seeing the result of the one before. A `set` shall create missing parent maps, and an empty (`null`) parent counts as missing. It shall never create a list, and on a list it shall only replace an item that exists. `set` on the path `[]` replaces the whole document. A `delete` on a path where nothing sits shall change nothing. An `insert` shall add an item to an existing list before the given index, or at the end for the list's length. A `set` of a whole map shall delete the keys the new map lacks. A `set` that gives the value already there shall change no character. Every result shall read back as the expected data and say its layout: `kept` when only the edited text changed, `reformatted` when the parsed document was rendered again with its comments, or `rewritten` when only `writeYamlFile` gave the expected data.

## Examples

- Given `name: Billing`, when `set ["name"]` to `Invoices` runs, then the text reads as `{ name: "Invoices" }`.
- Given an empty text, when `set ["top", "inner"]` to `1` runs, then it gives `top:\n  inner: 1\n`.
- Given `env:` with no value, when `set ["env", "KEY"]` to `x` runs, then `env` becomes a map holding `KEY: x`.
- Given a list of two steps, when `insert ["steps", 0]` and `insert ["steps", 3]` run, then the new items are first and last.
- Given a map with `a`, `b` and `c`, when `set []` to `{ a, c, d }` runs, then `b` is deleted, `d` is added at the end, and `a` and `c` keep their place.
- Given a map, when `delete ["missing"]` runs, then the text is unchanged.
- Given two edits where the second sets a key the first created, when `editYaml` runs, then both apply.
- Given `q: 'x'   # odd spacing`, when `set ["q"]` to `x` runs, then the text is unchanged and the layout is `kept`.
- Given `name: Billing # shown in the list`, when `set ["name"]` to `x` runs, then the comment stays and the layout is `kept`.
