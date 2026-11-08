# std.deep-equal

- Status: active
- Since: 0.1.0
- Source: replaces the `JSON.stringify(a) === JSON.stringify(b)` comparisons in the old repo at 784f78d

The deep-equality function shall compare arrays item by item in order, plain objects key by key in any order, dates by time and primitives by value with `NaN` equal to `NaN`, and shall treat any other object as equal only to itself.

The deep-equality function does not support circular data and throws a `RangeError` for it. JSON can't express cycles, and `@halonicjs/yaml` rejects aliases that refer to themselves. The deep-clone function keeps cycles because it mirrors `structuredClone`, while comparing a cycle would need extra bookkeeping on every call.

## Examples

- Given `{ a: 1, b: [1, 2] }` and `{ b: [1, 2], a: 1 }`, when they are compared, then they are equal.
- Given `[1, 2]` and `[2, 1]`, when they are compared, then they are not equal.
- Given `{ a: undefined }` and `{}`, when they are compared, then they are not equal.
- Given two different `Map` objects with the same entries, when they are compared, then they are not equal.
- Given an object that contains itself, when it is compared, then a `RangeError` is thrown.
