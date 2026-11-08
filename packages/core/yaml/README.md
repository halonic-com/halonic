# @halonicjs/yaml

Our thin layer over the yaml library: reads and writes the YAML our workspace files use, with a line and column for every node and clear errors for what we don't support. The only package that imports yaml.

- **Layer:** core
- **Owner:** maya
- **Public API:** `@halonicjs/yaml`

## Example

```ts
import { readYaml } from "@halonicjs/yaml";

const read = readYaml(text);
if (!read.ok) {
  // { kind: "syntax" | "unsupported" | "too-deep" | "too-large", message, line, col }
  return report(read.error);
}
read.value.data; // plain objects, arrays, strings, numbers, booleans, null
read.value.positionOf(["steps", 0, "id"]); // { line: 3, col: 9 }, or the nearest parent
```

## What it rejects

Anchors, aliases, tags, a second document and lists or maps as keys give an
`unsupported` problem with a message that says what to do instead.
Nesting past 100 levels and texts over 5,000,000 characters are rejected too,
because the reader runs on other people's workspaces.
