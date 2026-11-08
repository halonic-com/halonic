# format.compact-yaml

- Status: active
- Since: 0.1.0
- Source: HAL-298; HAL-216; old app `toYaml` at commit 784f78d

When a compacted value is written as YAML, the format shall give the same text, byte for byte, as the old app's `toYaml`, so the first save in the new app does not rewrite a file whose content did not change.

## Examples

- Given `{ a: undefined, b: 1 }`,
  when it is compacted and written as YAML,
  then the text is `b: 1` and a line break.
- Given `{ list: [undefined, {}, [], { a: [] }] }`,
  when it is compacted and written as YAML,
  then the list keeps all four items, written as `- null`, `- {}`, `- []` and `- {}`.
- Given `{}`, or `{ a: {}, b: [] }`,
  when it is compacted and written as YAML,
  then the text is `{}` and a line break.
- Given the acme workspace, agent, workflow or routine file,
  when it is compacted and written as YAML,
  then the text matches what the old app's `toYaml` wrote for it.
