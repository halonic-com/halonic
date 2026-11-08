# schema-kit.derived-types

- Status: active
- Since: 0.1.0
- Source: new in the core schema-kit package

The `Infer` and `InferInput` types shall give the TypeScript type a schema parses to and accepts, with keys of optional schemas optional in both and keys with defaults optional only in the input.

## Examples

- Given `s.object({ a: s.string(), b: s.number().optional(), c: s.boolean().default(false) })`,
  when `Infer` is applied,
  then the type is `{ a: string; b?: number | undefined; c: boolean }`.
- Given the same schema,
  when `InferInput` is applied,
  then the type is `{ a: string; b?: number | undefined; c?: boolean | undefined }`.
- Given `const Guard: Schema<Guard> = s.lazy(() => …)` for a recursive type,
  when it is type-checked,
  then it compiles, and `parse` returns a `Guard`.
