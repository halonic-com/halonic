# ports.untrusted-knowledge

- Status: active
- Since: 0.1.0
- Source: new in the core ports package: a knowledge source on a remote server returns text the workspace didn't write, and the port had no way to say so

The `KnowledgeProvider` port shall let a provider say whether its hits and documents are untrusted, so Halonic can fence them off like an untrusted tool result. A provider that doesn't say shall count as untrusted, so a forgotten field never lets outside text through unfenced.

## Examples

- Given a `KnowledgeProvider` with `untrusted: true` or `untrusted: false`,
  when it is passed where a `KnowledgeProvider` is expected,
  then it compiles.
- Given a `KnowledgeProvider` without `untrusted`,
  when Halonic reads the field,
  then it gets `undefined`, which counts as untrusted.
- Given a `KnowledgeProvider` with `untrusted: "yes"`,
  when it is compiled,
  then it doesn't compile.
