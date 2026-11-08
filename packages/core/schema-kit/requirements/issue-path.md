# schema-kit.issue-path

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3, D7)

When an input does not match, schema-kit shall give each issue the path from the root to the value, as a list of object keys and list indexes.

## Examples

- Given `s.object({ cases: s.array(s.object({ name: s.string() })) })` and `{ cases: [{ name: "a" }, { name: 2 }] }`,
  when it is parsed,
  then the one issue has the path `["cases", 1, "name"]`.
- Given a wrong value at the root,
  when it is parsed,
  then the issue has the empty path `[]`.
- Given the path `["cases", 1, "name"]`,
  when `formatPath` formats it,
  then it returns `cases[1].name`.
