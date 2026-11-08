# std.key-path

- Status: active
- Since: 0.1.0
- Source: HAL-506, from the review of HAL-345, so a path in an error message points at one place only

The key-path function shall add an object key to a path after a dot when the key is a simple identifier, and otherwise as a JSON-quoted string in brackets.

## Examples

- Given the path `value` and the key `steps`, when the key is added, then the path is `value.steps`.
- Given the path `value` and the key `a.b`, when the key is added, then the path is `value["a.b"]`, which differs from `value.a.b`.
- Given the path `value` and the key `0`, when the key is added, then the path is `value["0"]`, which differs from the array index `value[0]`.
