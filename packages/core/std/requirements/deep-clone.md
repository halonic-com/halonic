# std.deep-clone

- Status: active
- Since: 0.1.0
- Source: replaces `structuredClone` in the old engine, memory store and mock model at 784f78d

The deep-clone function shall copy arrays, plain objects, dates and primitives so the copy shares no objects with the original, keeping shared and circular references as `structuredClone` does.

If the value contains a function, a symbol or an object that isn't plain data, then the deep-clone function shall throw a `TypeError` that says what it is and where.

## Examples

- Given a run event with nested data, when it is cloned, then the copy equals `structuredClone`'s copy and shares no objects with the original.
- Given an object whose two keys point to the same object, when it is cloned, then both keys of the copy point to one new object.
- Given `JSON.parse('{"__proto__": {...}}')`, when it is cloned, then the copy has a plain `__proto__` key and `Object.prototype` as its prototype.
- Given `{ seen: new Map() }`, when it is cloned, then a `TypeError` says "value.seen is a Map".
