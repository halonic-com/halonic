import {
  ChevronDownIcon,
  ChevronRightIcon,
  ContextMenu,
  type ContextMenuTarget,
} from "@halonicjs/studio-kit";
import {
  Fragment,
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fileName } from "../file-item.ts";
import { fileMenuEntries } from "../file-menu.ts";
import { filesWords } from "../files-words.ts";
import { cutInMiddle, cutToWidth } from "../tree/cut-name.ts";
import { pressKey, type TreeIntent, type TreeState } from "../tree/tree-keyboard.ts";
import type { TreeNode } from "../tree/tree-model.ts";
import { type TreeRow, visibleRows } from "../tree/visible-rows.ts";
import { type NameRoom, useNameRoom } from "./name-room.tsx";
import { RenameRow, type RenameRowProps } from "./rename-row.tsx";
import { RowMenuButton } from "./row-menu-button.tsx";

/** The most characters of a name a row shows before it cuts the middle, until its room is measured. */
const nameLimit = 32;

/**
 * The name a row shows: cut in the middle to the room its row has, so its start and its end stay in
 * sight at any depth, or at `nameLimit` characters until the room is measured.
 *
 * @param isOpenFile - whether the row is the file in the active tab
 */
function shownName(node: TreeNode, nameRoom: NameRoom, isOpenFile: boolean): string {
  // The open file's name is in medium weight, which is wider: it is cut at its own widths.
  const widthOf = isOpenFile ? nameRoom.openWidthOf : nameRoom.widthOf;
  const width = nameRoom.room.get(node.path);
  if (width === undefined || widthOf === undefined) return cutInMiddle(node.name, nameLimit);
  return cutToWidth(node.name, width, widthOf);
}

/**
 * A tree row in the list column (requirement `files.ui.tree-rows`), the new design's tree row
 * (HAL-20742): 32px high with 8px corners, 10px inside the column's edges through the tree's own
 * padding. It only grows for a name field's message.
 */
const treeRowClasses =
  "group flex min-h-control-md w-full min-w-0 cursor-pointer items-center gap-1 rounded-sm pr-2 text-body text-fg hover:bg-surface-muted focus-ring-inset aria-selected:bg-surface-muted aria-selected:text-body-strong aria-selected:not-focus-visible:selected-forced";

/** The file a menu is open for, with where it opened. */
interface RowMenu extends ContextMenuTarget {
  readonly path: string;
}

/** Whether the key press asks for the focused row's menu: Shift F10 or the Menu key. */
function opensMenu(event: Pick<KeyboardEvent, "key" | "shiftKey">): boolean {
  return event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
}

/** What a screen reader reads after a file's name: its marks, but not while its name is edited. */
function descriptionOf(
  node: TreeNode,
  marks: string | undefined,
  renamingPath: string | undefined,
): string | undefined {
  return node.kind === "folder" || node.path === renamingPath ? undefined : marks;
}

/** Whether a row shows the ⋮: a file does, except while its name is edited. */
function hasMenuButton(node: TreeNode, renamingPath: string | undefined): boolean {
  return node.kind === "file" && node.path !== renamingPath;
}

/** Props for {@link FilesTree}. */
export interface FilesTreeProps {
  /** The top rows from `buildTree`. */
  readonly roots: readonly TreeNode[];
  /** The focused row, the opened folders and the type-ahead letters; the page owns them. */
  readonly state: TreeState;
  readonly onStateChange: (state: TreeState) => void;
  /** The file shown in the active tab, which gets the selected look. */
  readonly activePath?: string;
  /** Called when a key or a click asks the rest of the Studio for something: open, rename, trash. */
  readonly onIntent?: (intent: TreeIntent) => void;
  /** The file whose name is edited in its row, with what the edit does. */
  readonly renaming?: { readonly path: string } & Pick<
    RenameRowProps,
    "onApply" | "check" | "impact" | "onStranded" | "onCancel"
  >;
  /** A row to give focus to as soon as it is in the tree, such as the renamed file at its new place. */
  readonly revealPath?: string;
  /** Whether `revealPath` also takes the focus; false keeps it where the user put it and moves only the Tab stop. */
  readonly revealFocus?: boolean;
  /** Called once `revealPath` has focus. */
  readonly onRevealed?: () => void;
  /** The time in milliseconds; tests pass their own. */
  readonly now?: () => number;
}

/** Warnings show only while the row has no errors: the worse mark is the one that counts. */
function warningsShown(node: TreeNode): number {
  return node.marks.errors > 0 ? 0 : node.marks.warnings;
}

/**
 * The row's name for a screen reader. A folder with marks is named with them, so they read as one
 * label. A file with a ⋮ is named by its full name alone: otherwise the button's own name joins the
 * row's, and a long name would be read cut in the middle. Other rows are named by what they show.
 */
function rowLabel(
  node: TreeNode,
  marks: string | undefined,
  renamingPath: string | undefined,
): string | undefined {
  if (node.kind === "folder") {
    return marks === undefined ? undefined : filesWords.folderMarks(node.name, marks);
  }
  return hasMenuButton(node, renamingPath) ? node.name : undefined;
}

function marksLabel(node: TreeNode): string | undefined {
  const warnings = warningsShown(node);
  const outside = node.kind === "folder" ? filesWords.outsideInside : filesWords.outside;
  const parts = [
    node.marks.outside ? outside : undefined,
    node.marks.errors > 0 ? filesWords.errors(node.marks.errors) : undefined,
    warnings > 0 ? filesWords.warnings(warnings) : undefined,
  ].filter((part) => part !== undefined);
  return parts.length === 0 ? undefined : parts.join(", ");
}

/** The marks carry a glyph as well as a colour, so a state never rests on colour alone. */
function RowMarks({ node }: { node: TreeNode }) {
  const { errors, outside } = node.marks;
  const warnings = warningsShown(node);
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1" aria-hidden="true">
      {outside && <span className="text-caption text-fg-muted">✎</span>}
      {warnings > 0 && <span className="text-caption text-warning">△ {warnings}</span>}
      {errors > 0 && <span className="text-caption text-danger">✕ {errors}</span>}
    </span>
  );
}

/**
 * The file tree as an ARIA tree with one Tab stop: the focused row is the only one in the tab
 * order, arrow keys move inside it (requirement `files.tree.keyboard`). Names are plain text, and
 * a long one is cut in the middle to the room its row has, so its start and its end stay in sight
 * at any depth; its full name is the title of the cut name.
 */
export function FilesTree({
  roots,
  state,
  onStateChange,
  activePath,
  onIntent,
  renaming,
  revealPath,
  revealFocus = true,
  onRevealed,
  now = Date.now,
}: FilesTreeProps) {
  const rows = useMemo(() => visibleRows(roots, state.expanded), [roots, state.expanded]);
  const tree = useRef<HTMLDivElement>(null);
  const nameRoom = useNameRoom(tree, rows, activePath);
  // The row that takes the Tab stop: the focused one, or the first while nothing is focused.
  const stop = rows.some((row) => row.node.path === state.focus) ? state.focus : rows[0]?.node.path;
  const focusing = useRef(false);
  const [menu, setMenu] = useState<RowMenu>();
  const menuPath = menu?.path;
  const isFile = (path: string) =>
    rows.some((row) => row.node.path === path && row.node.kind === "file");

  useEffect(() => {
    if (!focusing.current || state.focus === undefined) return;
    focusing.current = false;
    for (const item of tree.current?.querySelectorAll<HTMLElement>("[data-path]") ?? []) {
      if (item.dataset["path"] === state.focus) item.focus();
    }
  }, [state.focus]);

  // The row asked for takes the focus once it is drawn: the renamed file may come a moment after the rename.
  useEffect(() => {
    if (revealPath === undefined) return;
    for (const item of tree.current?.querySelectorAll<HTMLElement>("[data-path]") ?? []) {
      if (item.dataset["path"] !== revealPath) continue;
      if (revealFocus) item.focus();
      // A key that was handled earlier must not pull the focus here when only the Tab stop moves.
      else focusing.current = false;
      onStateChange({ ...state, focus: revealPath });
      onRevealed?.();
      return;
    }
  }, [revealPath, revealFocus, rows, onRevealed, onStateChange, state]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const focused = (event.target as HTMLElement).closest<HTMLElement>("[data-path]");
    const path = focused?.dataset["path"];
    if (opensMenu(event) && focused !== null && path !== undefined && isFile(path)) {
      event.preventDefault();
      setMenu({ path, element: focused });
      return;
    }
    const result = pressKey(rows, { ...state, focus: state.focus ?? stop }, event, now());
    if (!result.handled) return;
    event.preventDefault();
    focusing.current = true;
    onStateChange(result.state);
    if (result.intent !== undefined) onIntent?.(result.intent);
  }

  /** The file menu's items: each asks the page for what a key on the row asks for. */
  function menuEntries(path: string) {
    const ask = (kind: "open" | "open-in-new-tab" | "rename" | "trash" | "copy-path") => () =>
      onIntent?.({ kind, path });
    return fileMenuEntries({
      open: ask("open"),
      openInNewTab: ask("open-in-new-tab"),
      rename: ask("rename"),
      remove: ask("trash"),
      copyPath: ask("copy-path"),
    });
  }

  /** A right-click on a file row opens its menu at the pointer; a folder has none. */
  function rightClicked(node: TreeNode, event: MouseEvent<HTMLElement>) {
    if (node.kind !== "file") return;
    event.preventDefault();
    event.stopPropagation();
    onStateChange({ ...state, focus: node.path });
    setMenu({
      path: node.path,
      element: event.currentTarget,
      at: { x: event.clientX, y: event.clientY },
    });
  }

  function activate(row: TreeRow, inNewTab = false) {
    const { node } = row;
    focusing.current = true;
    if (node.kind === "file") {
      onStateChange({ ...state, focus: node.path });
      onIntent?.({ kind: inNewTab ? "open-in-new-tab" : "open", path: node.path });
      return;
    }
    const expanded = new Set(state.expanded);
    if (!expanded.delete(node.path)) expanded.add(node.path);
    onStateChange({ ...state, focus: node.path, expanded });
  }

  return (
    // The keys are handled on the tree, where they bubble from the focused row.
    <div
      ref={tree}
      role="tree"
      aria-label={filesWords.treeLabel}
      className="grid px-2.5"
      onKeyDown={onKeyDown}
    >
      <ContextMenu
        label={filesWords.fileMenu(fileName(menu?.path ?? ""))}
        entries={menu === undefined ? [] : menuEntries(menu.path)}
        target={menu}
        onClose={() => setMenu(undefined)}
      />
      {rows.map((row) => {
        const { node } = row;
        const open = node.kind === "folder" && state.expanded.has(node.path);
        const label = marksLabel(node);
        const shown = shownName(node, nameRoom, node.path === activePath);
        return (
          <Fragment key={node.path}>
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: keys are handled by the tree */}
            <div
              role="treeitem"
              data-path={node.path}
              tabIndex={node.path === stop ? 0 : -1}
              aria-level={row.depth + 1}
              aria-posinset={row.position}
              aria-setsize={row.siblings}
              aria-expanded={node.kind === "folder" ? open : undefined}
              aria-selected={node.path === activePath}
              aria-label={rowLabel(node, label, renaming?.path)}
              // The marks are not read along with the name field while it is edited.
              aria-description={descriptionOf(node, label, renaming?.path)}
              // A row never grows past the tree: the name gives way, so the marks and ⋮ stay in
              // sight. The row under the pointer and the open file's share one fill, as the list
              // rows of the two-column layout do, so the open file's name is also in medium
              // weight (`files.ui.tree-rows`). In high contrast both marks are outlines: the open
              // file's steps aside while the row has keyboard focus, so the focus outline shows.
              className={treeRowClasses}
              style={{ paddingLeft: `${row.depth * 16 + 13}px` }}
              // A Ctrl-click, Cmd-click or middle click opens a file in a new tab, as a run row's
              // does (`files.ui.file-tab`). A Ctrl-click on a folder opens or closes it as a click
              // does; a middle click leaves a folder as it is.
              onClick={(event) => {
                event.stopPropagation();
                activate(row, event.ctrlKey || event.metaKey);
              }}
              onAuxClick={(event) => {
                if (event.button !== 1 || node.kind !== "file") return;
                event.stopPropagation();
                activate(row, true);
              }}
              onContextMenu={(event) => rightClicked(node, event)}
            >
              <span
                className="inline-grid size-icon-sm shrink-0 place-items-center text-fg-subtle *:size-full"
                aria-hidden="true"
              >
                {node.kind === "folder" && (open ? <ChevronDownIcon /> : <ChevronRightIcon />)}
              </span>
              {renaming?.path === node.path ? (
                <RenameRow
                  name={node.name}
                  onApply={renaming.onApply}
                  check={renaming.check}
                  impact={renaming.impact}
                  onStranded={renaming.onStranded}
                  onCancel={renaming.onCancel}
                />
              ) : (
                // The name takes all the room the row leaves, which is what `useNameRoom` measures;
                // `truncate` still cuts the end where text can't be measured. The full name shows
                // on hover over the cut one. On the row, a screen reader would read it again after
                // the row's name, as its description.
                <span
                  data-name
                  className="min-w-0 flex-1 truncate"
                  title={shown === node.name ? undefined : node.name}
                >
                  {shown}
                </span>
              )}
              <RowMarks node={node} />
              {hasMenuButton(node, renaming?.path) && (
                <RowMenuButton
                  name={node.name}
                  open={menuPath === node.path}
                  onPress={(event) => {
                    onStateChange({ ...state, focus: node.path });
                    setMenu({ path: node.path, element: event.currentTarget });
                  }}
                />
              )}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
