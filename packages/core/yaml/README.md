# @halonicjs/yaml

Our thin layer over the yaml library: reads and writes the YAML our workspace files use, with a line and column for every node and clear errors for what we don't support. The only package that imports yaml.

- **Layer:** core
- **Owner:** maya
- **Public API:** `@halonicjs/yaml`

## Example

Read a file, find the line and column of a node, edit it and write the data back. The code lives in
[`examples/read-and-edit.ts`](examples/read-and-edit.ts), where it is typechecked and run by
`src/example.test.ts`; keep this copy in step with it. The file imports `../src/index.ts`, because a
package may not import itself by name; outside this package, import `@halonicjs/yaml` as below.

```ts
import { editYaml, readYaml, writeYamlFile } from "@halonicjs/yaml";

const text = `# Nightly billing check
name: Billing
steps:
  - id: check # runs first
    model: slow
`;

/** Reads a file, finds a node's line and column, edits it and writes the data back. */
export function runExample(): {
  position: { line: number; col: number } | undefined;
  problem: string | undefined;
  edited: string | undefined;
  layout: string | undefined;
  written: string;
} {
  const read = readYaml(text);
  if (!read.ok) throw new Error(read.error.message);
  const position = read.value.positionOf(["steps", 0, "id"]); // { line: 4, col: 9 }

  // A file we don't support says where, and what to do instead.
  const bad = readYaml("base: &base 1\n");
  const problem = bad.ok ? undefined : `${bad.error.kind} at ${bad.error.line}:${bad.error.col}`; // "unsupported at 1:13"

  // An edit keeps every comment and line it doesn't touch.
  const edited = editYaml(text, [{ kind: "set", path: ["steps", 0, "model"], value: "fast" }]);

  // writeYamlFile writes data only: comments are gone.
  const written = writeYamlFile(read.value.data);

  return {
    position,
    problem,
    edited: edited.ok ? edited.value.text : undefined,
    layout: edited.ok ? edited.value.layout : undefined, // "kept"
    written,
  };
}
```

A problem is `{ kind: "syntax" | "unsupported" | "too-deep" | "too-large", message, line, col }`.
`positionOf` answers with the nearest parent when nothing sits at the path.

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

## Editing

`editYaml(text, edits)` applies `set`, `delete` and `insert` edits to a file
and keeps everything the edits don't touch, so a structured editor can save
while the user watches the file.

```ts
import { editYaml } from "@halonicjs/yaml";

const edited = editYaml(text, [
  { kind: "set", path: ["steps", 0, "model"], value: "fast" },
  { kind: "insert", path: ["steps", 1], value: { id: "review" } },
  { kind: "delete", path: ["draft"] },
]);
if (!edited.ok) {
  // a readYaml problem, or { kind: "bad-edit", edit: 1, message }
  return report(edited.error);
}
if (edited.value.layout === "rewritten") {
  // The comments are gone: warn before saving.
}
save(edited.value.text);
```

- `set` creates missing maps on the way (never lists). On a list it replaces
  an item that exists; use `insert` to add one. `set` on `[]` replaces the
  whole document.
- `delete` removes a key or item with its lines and its trailing comment. The
  comments above it stay. The last entry leaves `{}` or `[]`, with those
  comments under it.
- `insert` adds a list item before the given index, or at the end for the
  list's length, above the comments over the item it goes before. So at the
  top of a file that is a list, `insert [0]` goes above a header comment that
  sits right over the first item; leave a blank line under the header to keep
  it first.
- If any edit doesn't fit, nothing is applied and the problem names that edit.

**Setting a whole map or list.** A `set` with a whole object changes only what
differs: changed keys are set, new keys go at the end, and keys missing from
the new value are deleted. Lists are compared item by item at the same index,
so putting an item at the front of a list rewrites every item after it and
moves their comments. To add, remove or reorder items, use `insert` and
`delete`: they keep the comments with their items. A `set` of the whole document
(`[]`) keeps the comments at the top of the file.

**Layout.** Every result is read back and must give the expected data. When
the splice can't manage that, the edit falls back, and `layout` says how far:

- `kept`: only the edited text changed. New lines get the file's line
  ending, `\r\n` or `\n`, and its indent: the width of its first nested map,
  and whether its lists are indented under their key. An edit inside a flow
  collection on one line, such as `[a, b]`, writes that collection again on
  its line. A comment on a key's line over a block value
  (`a: # about a`) stays when the value is replaced; comment lines inside the
  old value go with it.
- `reformatted`: the file was rendered again from the parsed document;
  comments stay, spacing and some quoting may not. A `\r\n` file stays
  `\r\n`. Adding or removing entries in a flow collection over several
  lines, and every edit in a file that mixes `\r\n` and `\n`, land here for
  now.
- `rewritten`: the file was written from its data with `writeYamlFile`, and
  every comment is gone.
