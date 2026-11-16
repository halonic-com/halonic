import { ChevronDownIcon, ChevronRightIcon } from "@halonicjs/studio-kit";
import { type KeyboardEvent, useEffect, useMemo, useRef } from "react";
import { filesWords } from "../files-words.ts";
import { cutInMiddle } from "../tree/cut-name.ts";
import { pressKey, type TreeIntent, type TreeState } from "../tree/tree-keyboard.ts";
import type { TreeNode } from "../tree/tree-model.ts";
import { type TreeRow, visibleRows } from "../tree/visible-rows.ts";

/** The most characters of a name a row shows before it cuts the middle. */
const nameLimit = 32;

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
  /** The time in milliseconds; tests pass their own. */
  readonly now?: () => number;
}

function marksLabel(node: TreeNode): string | undefined {
  const parts = [
    node.marks.errors > 0 ? filesWords.errors(node.marks.errors) : undefined,
    node.marks.warnings > 0 ? filesWords.warnings(node.marks.warnings) : undefined,
    node.marks.outside ? filesWords.outside : undefined,
  ].filter((part) => part !== undefined);
  return parts.length === 0 ? undefined : parts.join(", ");
}

function RowMarks({ node }: { node: TreeNode }) {
  const { errors, warnings, outside } = node.marks;
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1" aria-hidden="true">
      {outside && <span className="size-1.5 rounded-full bg-fg-muted" />}
      {warnings > 0 && <span className="text-xs text-warning">{warnings}</span>}
      {errors > 0 && <span className="text-xs text-danger">{errors}</span>}
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
  now = Date.now,
}: FilesTreeProps) {
  const rows = useMemo(() => visibleRows(roots, state.expanded), [roots, state.expanded]);
  const tree = useRef<HTMLDivElement>(null);
  // The row that takes the Tab stop: the focused one, or the first while nothing is focused.
  const stop = rows.some((row) => row.node.path === state.focus) ? state.focus : rows[0]?.node.path;
  const focusing = useRef(false);

  useEffect(() => {
    if (!focusing.current || state.focus === undefined) return;
    focusing.current = false;
    for (const item of tree.current?.querySelectorAll<HTMLElement>("[data-path]") ?? []) {
      if (item.dataset["path"] === state.focus) item.focus();
    }
  }, [state.focus]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const result = pressKey(rows, { ...state, focus: state.focus ?? stop }, event, now());
    if (!result.handled) return;
    event.preventDefault();
    focusing.current = true;
    onStateChange(result.state);
    if (result.intent !== undefined) onIntent?.(result.intent);
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
      {rows.map((row) => {
        const { node } = row;
        const open = node.kind === "folder" && state.expanded.has(node.path);
        const label = marksLabel(node);
        return (
          // biome-ignore lint/a11y/useKeyWithClickEvents: keys are handled by the tree
          <div
            key={node.path}
            role="treeitem"
            data-path={node.path}
            tabIndex={node.path === stop ? 0 : -1}
            aria-level={row.depth + 1}
            aria-posinset={row.position}
            aria-setsize={row.siblings}
            aria-expanded={node.kind === "folder" ? open : undefined}
            aria-selected={node.path === activePath}
            aria-description={label}
            title={node.name.length > nameLimit ? node.name : undefined}
            className={`flex h-8 cursor-pointer items-center gap-1 rounded-sm pr-2 text-sm text-fg outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-accent aria-selected:bg-accent-soft`}
            style={{ paddingLeft: `${row.depth * 16 + 4}px` }}
            onClick={(event) => {
              event.stopPropagation();
              activate(row);
            }}
          >
            <span
              className="inline-grid size-icon-md shrink-0 place-items-center *:size-full"
              aria-hidden="true"
            >
              {node.kind === "folder" && (open ? <ChevronDownIcon /> : <ChevronRightIcon />)}
            </span>
            <span className="min-w-0 truncate">{cutInMiddle(node.name, nameLimit)}</span>
            <RowMarks node={node} />
          </div>
        );
      })}
    </div>
  );
}
