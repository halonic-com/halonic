# @halonicjs/studio-feature-files

The Files feature of the Studio: the workspace's file tree, and (in later changes) the code editor tab, New file, Rename and Delete.

- **Layer:** studio
- **Owner:** elena
- **Public API:** `@halonicjs/studio-feature-files` (the feature) and `@halonicjs/studio-feature-files/api`

## What is here

`src/tree` is the tree as a pure model, with no screen yet:

- `buildTree` turns the engine's file list into rows: folders first, sorted by name, without `.studio`, `.git` or `node_modules`, with errors, warnings and "changed outside Halonic" added up on each folder.
- `visibleRows` lists the rows shown for a set of opened folders; `revealFile` opens the folders above a file.
- `deepestRow` finds a path's row, else its deepest folder in the tree, and `revealRow` opens the folders down to it. Another feature asks the tree to show a path with `requestFilesReveal(path)` from `api.ts`; the path is read from the workspace folder, and an absolute path or one with `..` asks for nothing (`files.tree.reveal-request`). It answers `shown`, `nearest` (the tree showed another row) or `dropped`, so the Library can say there is no docs folder.
- `matchingFiles` keeps the files whose path holds the searched text, whatever the case, and `searchedTree` names the folders to open and counts the files the tree draws. The view's search field uses them through `useTreeSearch`: while it holds text the tree shows only the matches, with their folders open, and the folders the person opened themselves come back when the field is empty (`files.ui.tree-search`).
- `pressKey` is all of the tree's keyboard: arrows, Home, End, `*`, type-ahead, Enter, F2 and Delete. A key held with Ctrl, Meta or Alt is left unhandled, so copy and app shortcuts still work. It returns the new state and, for Enter, F2 and Delete, an intent for the Studio to act on.
- `cutInMiddle` shortens a long name and keeps its ending.

`code-page.ts` and `ui/code-page.tsx` are Code's page, which the rail's Code entry opens (`files.code-page`): the tree in the list column, and the file picked there in the content pane, in place of the last one; a Ctrl-click opens a file in a new tab. `treeContext` gives the tree a context whose `openItem` shows a file in the pane instead of the tab.

## Example

```ts
import { buildTree } from "./tree/tree-model.ts";
import { emptyTreeState, pressKey } from "./tree/tree-keyboard.ts";
import { visibleRows } from "./tree/visible-rows.ts";

const roots = buildTree(["hubs/p/hub.yaml", "models.yaml"]);
const rows = visibleRows(roots, new Set());
const { state } = pressKey(rows, { ...emptyTreeState, focus: "hubs" }, { key: "ArrowRight", ctrlKey: false, metaKey: false, altKey: false }, Date.now());
// state.expanded now holds "hubs"
```
