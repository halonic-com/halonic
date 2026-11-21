# yaml.edit-move

- Status: active
- Since: unreleased
- Source: HAL-14904, so moving a step's arrow up or down in the Studio's step card keeps the comments a person wrote on and above that arrow (HAL-12216)

When `editYaml` applies a `move` with a `path` that ends in a list index and a new index `to`, the layer shall take that item out of its list and put it back in at `to`, so `to` is the item's index after the move. When the splice can do it, the item shall move as one block of lines: the comment lines right above its `-` at the same indent, with no blank line between, its own lines, the comment at the end of its last line and the comment lines right below it that are indented further than its `-`. Everything between the blocks, such as a blank line or a comment above the first item at the list key's indent, shall stay where it is, every other line shall stay byte for byte, and the layout shall be `kept`. A list in flow style on one line, like `[a, b]`, shall be written again on its line. When the splice can't do it, the edit shall fall back to the `reformatted` and then the `rewritten` layout like any other edit. A `move` with `to` equal to the item's index shall change no character. If the `path` doesn't end in a list index, or no item is at `path`, or `to` isn't a whole number from 0 to one less than the list's length, then `editYaml` shall return a `bad-edit` problem.

## Examples

- Given `on:` with `a`, `b` and `c`, when `move ["on", 0]` to `2` runs, then the list is `b`, `c`, `a` and the layout is `kept`.
- Given an item with a comment line above it and a comment at the end of its line, when it moves, then both comments move with it.
- Given a comment line indented under the last line of an item, when that item moves, then the comment moves with it.
- Given a comment above the first item at the `on:` key's indent, when the first item moves, then that comment stays under `on:`.
- Given a blank line between two items, when an item moves, then the blank line stays in its place.
- Given a text without a line break at the end, when its last item moves up, then the text still has none at the end and every item is on its own line.
- Given `on: [a, b]`, when `move ["on", 0]` to `1` runs, then it gives `on: [b, a]`.
- Given a flow list over several lines, when an item moves, then the layout is `reformatted`.
- Given `on:` with `a` and `b`, when `move ["on", 0]` to `0` runs, then the text is unchanged.
- Given `a: {x: 1}`, when `move ["a", "x"]` runs, then the problem says the path must end in a list index.
- Given `on:` with two items, when `move ["on", 2]` runs, then the problem says there is no item 2; when `move ["on", 0]` to `2`, `-1` or `0.5` runs, then the problem says where `to` may go.
