# schema-kit.prototype-keys

- Status: active
- Since: 0.1.0
- Source: the old schema package (`packages/core/schema`) at 784f78d, which uses Zod 4.6.7

If an input map has a key named `__proto__`, then `parse` shall never change the prototype of a parsed value: records, passthrough objects and intersections drop the key, and strict objects report it as unknown.

## Examples

- Given `s.record(s.string(), s.unknown())` and the JSON `{"__proto__": {"x": 1}, "a": 1}`,
  when it is parsed,
  then the value is `{ a: 1 }` and its prototype is `Object.prototype`.
- Given `s.object({ a: s.number() }).strict()` and the same JSON,
  when it is parsed,
  then there is one `unrecognized_keys` issue at `[]` with the keys `["__proto__"]`.
