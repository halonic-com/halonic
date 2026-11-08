# std.is-plain-object

- Status: active
- Since: 0.1.0
- Source: HAL-345, so `format`'s `compact` can refuse what `deepClone` refuses

The plain-object check shall answer true for an object whose prototype is `Object.prototype` or `null`, and false for everything else, including arrays, dates, maps, class instances and primitives.

## Examples

- Given `{}`, `Object.create(null)` or `JSON.parse('{"a": 1}')`, when it is checked, then the answer is true.
- Given `[]`, `new Date(0)`, `new Map()` or an instance of a class, when it is checked, then the answer is false.
- Given `null`, `undefined`, `"x"` or `1`, when it is checked, then the answer is false.
