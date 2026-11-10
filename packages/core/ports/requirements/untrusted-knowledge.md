# ports.untrusted-knowledge

- Status: active
- Since: 0.1.0
- Source: new in the core ports package: a knowledge source on a remote server returns text the workspace didn't write, and the port had no way to say so

The `KnowledgeProvider` port shall let a provider say whether its hits and documents are untrusted, so Halonic can fence them off like an untrusted tool result. A provider that doesn't say shall count as untrusted, so a forgotten field never lets outside text through unfenced.

The ref of a hit or a document can't be fenced, because the model sends it back to read the document. A remote source chooses its refs, so a long ref is unfenced text it wrote. Halonic shall therefore drop a hit or a document of an untrusted provider whose ref is longer than 512 characters, so the model never sees it. A ref of up to 512 characters is an unfenced channel this rule accepts as a known risk; paths and links fit within it.

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
- Given an untrusted `KnowledgeProvider` whose search returns a hit with a ref of 513 characters,
  when Halonic hands the hits to the model,
  then that hit is left out.
- Given an untrusted `KnowledgeProvider` that holds a document with a ref of 513 characters,
  when the model asks to read that ref,
  then Halonic answers as if the document weren't there.
