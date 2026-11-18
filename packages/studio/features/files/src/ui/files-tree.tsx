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
import { cutInMiddle } from "../tree/cut-name.ts";
import { pressKey, type TreeIntent, type TreeState } from "../tree/tree-keyboard.ts";
import type { TreeNode } from "../tree/tree-model.ts";
import { type TreeRow, visibleRows } from "../tree/visible-rows.ts";
import { RenameRow, type RenameRowProps } from "./rename-row.tsx";
import { RowMenuButton } from "./row-menu-button.tsx";

/** The most characters of a name a row shows before it cuts the middle. */
const nameLimit = 32;

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
      {outside && <span className="text-xs text-fg-muted">✎</span>}
      {warnings > 0 && <span className="text-xs text-warning">△ {warnings}</span>}
      {errors > 0 && <span className="text-xs text-danger">✕ {errors}</span>}
    </span>
  );
}

/**
 * The file tree as an ARIA tree with one Tab stop: the focused row is the only one in the tab
 * order, arrow keys move inside it (requirement `files.tree.keyboard`). Names are plain text, and
 * a long one is cut in the middle; its full name is the row's title.
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

  function activate(row: TreeRow) {
    const { node } = row;
    focusing.current = true;
    if (node.kind === "file") {
      onStateChange({ ...state, focus: node.path });
      onIntent?.({ kind: "open", path: node.path });
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
      className="grid"
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
              title={node.name.length > nameLimit ? node.name : undefined}
              className={`group flex min-h-8 cursor-pointer items-center gap-1 rounded-sm pr-2 text-sm text-fg outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-accent aria-selected:bg-accent-soft`}
              style={{ paddingLeft: `${row.depth * 16 + 4}px` }}
              onClick={(event) => {
                event.stopPropagation();
                activate(row);
              }}
              onContextMenu={(event) => rightClicked(node, event)}
            >
              <span
                className="inline-grid size-icon-md shrink-0 place-items-center *:size-full"
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
                <span className="min-w-0 truncate">{cutInMiddle(node.name, nameLimit)}</span>
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
