# format.compact

- Status: active
- Since: 0.1.0
- Source: HAL-216; HAL-111 review; old app `compact` at commit 784f78d; HAL-345; HAL-506

When a value is compacted before it is written to a file, the format shall leave out every object key whose value, once compacted itself, is `undefined`, an empty array or an empty object, keep `null`, `""`, `0` and `false`, compact array items without removing any, keep the value passed in even when it ends up empty, keep a key named `__proto__` as an ordinary key, and otherwise give the same result as the old app's `compact`.

If the value contains an object that is neither a plain object nor an array, such as a `Date`, a `Map` or a class instance, then the format shall throw a `TypeError` that says what it is and where, instead of writing it.

Both rules are allowed differences from the old app, which turned such an object into `{}` and left it out, and which let a `__proto__` key set the result's prototype instead of keeping the key. See [the decision note](../../../../decisions/priya/HAL-345-compact-strict.md).

## Examples

- Given `{ name: "triage", tags: [], layout: {}, note: undefined }`,
  when it is compacted,
  then the result is `{ name: "triage" }`.
- Given `{ a: { b: [] }, keep: 1 }`,
  when it is compacted,
  then `a` is left out, because compacting it leaves an empty object, and the result is `{ keep: 1 }`.
- Given `{ n: null, s: "", z: 0, f: false }`,
  when it is compacted,
  then every key is kept.
- Given `{ list: [undefined, {}, [], { a: [] }] }`,
  when it is compacted,
  then the list keeps all four items, as `[undefined, {}, [], {}]`.
- Given `{}`, or `{ a: {} }`,
  when it is compacted,
  then the result is `{}`.
- Given `{ at: new Date(5), keep: 1 }`,
  when it is compacted,
  then a `TypeError` says "value.at is a Date".
- Given `{ a: Object.create({}) }`,
  when it is compacted,
  then a `TypeError` says "value.a is an object with a custom prototype".
- Given `{ "a.b": { "0": new Map() } }`,
  when it is compacted,
  then a `TypeError` says `value["a.b"]["0"] is a Map`.
- Given `JSON.parse('{"__proto__": {"a": 1}}')`,
  when it is compacted,
  then the result has an own `__proto__` key whose value is `{ a: 1 }`, its prototype is still `Object.prototype`, and `Object.prototype` is unchanged.
- Given the acme support agent loaded with its defaults,
  when it is compacted,
  then the result matches what the old app's `compact` returned for it.
