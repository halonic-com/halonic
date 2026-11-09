# std.canonical-json

- Status: active
- Since: 0.1.0
- Source: HAL-188 (the trust fingerprint hashes canonical JSON with sorted keys and arrays kept as arrays, HAL-65 J8)

The std package shall write plain data as one canonical JSON text: object keys sorted by code unit at every depth, arrays in order, no spaces, and object keys whose value is `undefined` left out. If the data holds a number that isn't finite, `undefined` in an array, or a value JSON can't hold, then it shall throw an error that says where that value is.

## Examples

- Given `{ b: [2, 1], a: "x" }`, when it is written, then the text is `{"a":"x","b":[2,1]}`.
- Given the same data with its keys in another order, when it is written, then the text is the same.
- Given `["a b"]` and `["a", "b"]`, when they are written, then the texts differ.
- Given `{ cost: NaN }`, when it is written, then it throws "Can't write value.cost as JSON: NaN isn't a finite number."
