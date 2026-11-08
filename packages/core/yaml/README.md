# @halonicjs/yaml

Our thin layer over the yaml library: reads and writes the YAML our workspace files use, with a line and column for every node and clear errors for what we don't support. The only package that imports yaml.

- **Layer:** core
- **Owner:** maya
- **Public API:** `@halonicjs/yaml`

## Example

```ts
import { readYaml, writeYamlFile } from "@halonicjs/yaml";

const read = readYaml(text);
if (!read.ok) {
  // { kind: "syntax" | "unsupported" | "too-deep" | "too-large", message, line, col }
  return report(read.error);
}
read.value.data; // plain objects, arrays, strings, numbers, booleans, null
read.value.positionOf(["steps", 0, "id"]); // { line: 3, col: 9 }, or the nearest parent

writeYamlFile(data); // the same text the old app wrote
```

## What it rejects

Anchors, aliases, tags, a second document and lists or maps as keys give an
`unsupported` problem with a message that says what to do instead.
Nesting past 100 levels and texts over 1,000,000 characters are rejected too,
because the reader runs on other people's workspaces.

## Writing

- `writeYamlFile(data)`: workspace files, line width 100.
- `writeFrontMatter({ name, description })`: the front matter of `SKILL.md`, library
  defaults, trimmed. The caller adds the `---` lines.

Both write exactly what the old app wrote (yaml 2.9.1, pinned). Neither keeps
comments: they write data, as the old app did. Dropping empty values before
writing is up to the caller.
