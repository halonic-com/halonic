# format.compact

- Status: active
- Since: 0.1.0
- Source: HAL-216; HAL-111 review; old app `compact` at commit 784f78d

When a value is compacted before it is written to a file, the format shall leave out every object key whose value, once compacted itself, is `undefined`, an empty array or an empty object, keep `null`, `""`, `0` and `false`, compact array items without removing any, keep the value passed in even when it ends up empty, and give the same result as the old app's `compact`.

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
- Given the acme support agent loaded with its defaults,
  when it is compacted,
  then the result matches what the old app's `compact` returned for it.
