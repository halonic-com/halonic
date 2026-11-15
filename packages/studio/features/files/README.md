# @halonicjs/studio-feature-files

The Files feature of the Studio: the workspace's file tree, and (in later changes) the code editor tab, New file, Rename and Delete.

- **Layer:** studio
- **Owner:** elena
- **Public API:** `@halonicjs/studio-feature-files` (the feature) and `@halonicjs/studio-feature-files/api`

## What is here

`src/tree` is the tree as a pure model, with no screen yet:

- `buildTree` turns the engine's file list into rows: folders first, sorted by name, without `.studio`, `.git` or `node_modules`, with errors, warnings and "changed outside Halonic" added up on each folder.
- `visibleRows` lists the rows shown for a set of opened folders; `revealFile` opens the folders above a file.
- `pressKey` is all of the tree's keyboard: arrows, Home, End, `*`, type-ahead, Enter, F2 and Delete. It returns the new state and, for Enter, F2 and Delete, an intent for the Studio to act on.
- `cutInMiddle` shortens a long name and keeps its ending.

## Example

```ts
import { buildTree } from "./tree/tree-model.ts";
import { emptyTreeState, pressKey } from "./tree/tree-keyboard.ts";
import { visibleRows } from "./tree/visible-rows.ts";

const roots = buildTree(["hubs/p/hub.yaml", "models.yaml"]);
const rows = visibleRows(roots, new Set());
const { state } = pressKey(rows, { ...emptyTreeState, focus: "hubs" }, "ArrowRight", Date.now());
// state.expanded now holds "hubs"
```
