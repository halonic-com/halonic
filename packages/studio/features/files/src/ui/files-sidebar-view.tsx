import {
  Button,
  EmptyState,
  PlusIcon,
  SearchField,
  SkeletonBar,
  useToastStore,
  useWriteClipboard,
} from "@halonicjs/studio-kit";
import { errorReasonFor, type WorkspaceContext } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { copyPath } from "../copy-path.ts";
import { FILE_KIND, fileItem, fileName } from "../file-item.ts";
import { FilesHostService, type FilesListing } from "../files-host.ts";
import { filesWords } from "../files-words.ts";
import { askFocusOnOpen } from "../focus-on-open.ts";
import { startingPath } from "../new-file.ts";
import { removeFile } from "../remove-file.ts";
import { renamedPath, renameFile, typedNameProblem } from "../rename-file.ts";
import { type RenameAsks, windowRenameAsks } from "../rename-request.ts";
import { type FilesRevealTaken, takeFilesRevealRequests } from "../reveal-request.ts";
import { emptyTreeState, type TreeIntent, type TreeState } from "../tree/tree-keyboard.ts";
import { deepestRow, revealFile, revealRow, visibleRows } from "../tree/visible-rows.ts";
import { FilesTree } from "./files-tree.tsx";
import { NewFileDialog } from "./new-file-dialog.tsx";
import { TitleLine } from "./title-line.tsx";
import { TreeSearchStatus } from "./tree-search-status.tsx";
import { useTreeSearch } from "./use-tree-search.ts";

/** What the sidebar's Files view gets: the context of the feature that added it. */
export interface FilesSidebarViewProps {
  readonly context: WorkspaceContext;
  /** The page's title on the + button's line, as Code's list column has it; the sidebar's none. */
  readonly title?: string;
  /**
   * Code's list column only: its page's own rename asks, which it takes in place of the window's.
   * With them, the view takes no window-wide ask, a file tab's Rename or another feature's reveal
   * request, so a Code page in a tab behind never takes what the sidebar's tree should
   * (`files.code-page`).
   */
  readonly pageAsks?: RenameAsks;
}

type Loaded =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly reason: string }
  | { readonly kind: "ready"; readonly listing: FilesListing };

const skeletonWidths = ["1/2", "2/3", "2/5", "3/5"] as const;

/**
 * The Files view in the sidebar: the workspace's file tree, with the loading, can't-load and empty
 * states. It lists again whenever the host says a file or a mark changed, and keeps the opened
 * folders and the focused row while it does.
 */
export function FilesSidebarView({ context, title, pageAsks }: FilesSidebarViewProps) {
  const host = context.services.get(FilesHostService);
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  const [state, setState] = useState<TreeState>(emptyTreeState);
  const [retrying, setRetrying] = useState(false);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string>();
  // The row that takes the focus once it is in the tree: the renamed file at its new place.
  // The row the tree keeps its Tab stop on; `focus` also moves the focus there (not after a blur).
  const [reveal, setReveal] = useState<{ path: string; focus: boolean }>();
  const toasts = useToastStore();
  const writeClipboard = useWriteClipboard();
  const addButton = useRef<HTMLButtonElement>(null);
  // The New file button that opened the dialog, the top one or the empty state's, gets focus back.
  const opener = useRef<HTMLElement | null>(null);
  const startAdding = useCallback(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAdding(true);
  }, []);

  const latest = useRef(0);
  // The row that takes focus once the listing shows it: the next row after a delete, the restored
  // row after Undo. The listing changes a moment after the host says so, so the focus waits for it.
  const pendingFocus = useRef<string | undefined>(undefined);

  const load = useCallback(
    (cancelled: () => boolean) => {
      // A slower, older listing must not overwrite a newer one.
      const mine = ++latest.current;
      const stale = () => cancelled() || mine !== latest.current;
      return host.list().then(
        (listing) => {
          if (!stale()) setLoaded({ kind: "ready", listing });
        },
        (error: unknown) => {
          if (stale()) return;
          setLoaded({ kind: "error", reason: errorReasonFor(error) });
        },
      );
    },
    [host],
  );

  useEffect(() => {
    let stopped = false;
    const cancelled = () => stopped;
    void load(cancelled);
    const unsubscribe = host.subscribe(() => void load(cancelled));
    return () => {
      stopped = true;
      unsubscribe();
    };
  }, [host, load]);

  const activeItem = context.activeItem;
  // A string, so a source that builds a new item on each read doesn't make React draw again and again.
  const activeFile = useSyncExternalStore(
    (listener) => activeItem?.subscribe(listener) ?? (() => {}),
    () => {
      const active = activeItem?.get();
      return active?.kind === FILE_KIND ? active.id : "";
    },
  );
  const activePath = activeFile === "" ? undefined : activeFile;

  // The rows to draw: the whole tree, or only what the search field asks for.
  const search = useTreeSearch(
    loaded.kind === "ready" ? loaded.listing : undefined,
    state,
    setState,
  );
  const { roots, allRoots, type: typeSearch } = search;

  // A tab's ⋮ or F2 asks for its file's name to be edited here; the ask waits until this view is
  // shown. A search could hide the file's row, and its name field with it, so the search ends,
  // and the folders above the file open, as the search may have been all that showed its row.
  // Code's list column takes only its own page's asks.
  const renames = pageAsks ?? windowRenameAsks;
  useEffect(() => {
    const takeAsk = () => {
      const path = renames.take();
      if (path === undefined) return;
      typeSearch("");
      setState((was) => ({ ...was, expanded: revealFile(was.expanded, path) }));
      setRenaming(path);
    };
    takeAsk();
    return renames.subscribe(takeAsk);
  }, [typeSearch, renames]);

  // A renamed or restored file takes the focus at its row. Where the search would leave that row
  // out, the search ends and the folders above the file open, so the focus has a row to land on
  // and doesn't wait to jump out of the search field later (`files.ui.tree-search`).
  const hidesNow = useRef(search.hides);
  hidesNow.current = search.hides;
  const showFile = useCallback(
    (path: string) => {
      if (!hidesNow.current(path)) return;
      typeSearch("");
      setState((was) => ({ ...was, expanded: revealFile(was.expanded, path) }));
    },
    [typeSearch],
  );

  const focusRow = useCallback((path: string | undefined) => {
    if (path === undefined) return;
    pendingFocus.current = path;
    setState((was) => ({ ...was, focus: path }));
  }, []);

  // Focus moves to the awaited row as soon as it is drawn; a row that never comes is dropped. The
  // row is this view's own: the window can hold two trees, the sidebar's and Code's list column.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const path = pendingFocus.current;
    if (path === undefined || loaded.kind !== "ready") return;
    const rows = root.current?.querySelectorAll<HTMLElement>("[data-path]") ?? [];
    const row = [...rows].find((item) => item.dataset["path"] === path);
    if (row === undefined) return;
    pendingFocus.current = undefined;
    row.focus();
  }, [loaded, state.focus, roots]);

  // The file in the active tab, read when a rename finishes or is undone, which may be later.
  const activeNow = useRef(activePath);
  activeNow.current = activePath;
  const clearReveal = useCallback(() => setReveal(undefined), []);

  // A path another feature asked to show, such as the Library's docs folder, taken once the tree
  // is listed: its row, else its deepest folder there, else the tree's first row. The answer says
  // which, so the Library can say there's no docs folder. A search would hide the row, so it ends.
  // Requests are meant for the sidebar's tree, so Code's list column leaves them.
  const revealAsked = useCallback(
    (path: string): FilesRevealTaken => {
      typeSearch("");
      const row = deepestRow(allRoots, path);
      const target = row?.path ?? allRoots[0]?.path;
      if (row !== undefined)
        setState((was) => ({ ...was, expanded: revealRow(was.expanded, row) }));
      if (target !== undefined) setReveal({ path: target, focus: true });
      return row?.path === path ? "shown" : "nearest";
    },
    [allRoots, typeSearch],
  );
  const listedNow = loaded.kind === "ready";
  useEffect(
    () => (listedNow && pageAsks === undefined ? takeFilesRevealRequests(revealAsked) : undefined),
    [listedNow, pageAsks, revealAsked],
  );

  const applyRename = useCallback(
    async (from: string, name: string, left: () => boolean): Promise<string | undefined> => {
      const refused = await renameFile(host, toasts, from, name, {
        // A file that was open stays open under its new name; a closed one is not opened.
        moved: (to) => {
          setRenaming(undefined);
          showFile(to);
          setReveal({ path: to, focus: !left() });
          if (activeNow.current === from) context.openItem?.(fileItem(to));
        },
        movedBack: (back) => {
          showFile(back);
          setReveal({ path: back, focus: true });
          if (activeNow.current === renamedPath(from, name)) context.openItem?.(fileItem(back));
        },
      });
      return refused;
    },
    [context, host, toasts, showFile],
  );

  // The refusal a row's focus can't reach: a toast that stays says it, and the row says what to try.
  const onStranded = useCallback(
    (sentence: string, tryAgain: () => void) => {
      const id = toasts?.show({
        tone: "danger",
        title: filesWords.couldntRenameToast(fileName(renaming ?? ""), sentence),
        action: { label: filesWords.tryAgain, onClick: tryAgain },
      });
      return () => {
        if (id !== undefined) toasts?.close(id);
      };
    },
    [toasts, renaming],
  );

  // Stable between renders, so the row's lookups aren't started again by every listing or mark update.
  const listed = loaded.kind === "ready" ? loaded.listing.paths : undefined;
  const check = useCallback(
    (name: string) =>
      renaming === undefined || listed === undefined
        ? undefined
        : typedNameProblem(renaming, name, listed),
    [renaming, listed],
  );
  const impact = useCallback(
    (name: string) =>
      renaming === undefined
        ? Promise.resolve({ places: 0, owners: [] })
        : host.renameImpact(renaming, renamedPath(renaming, name)),
    [host, renaming],
  );

  const shownExpanded = search.state.expanded;
  const onIntent = useCallback(
    (intent: TreeIntent) => {
      if (intent.kind === "open") context.openItem?.(fileItem(intent.path));
      if (intent.kind === "open-in-new-tab") context.openItemInNewTab?.(fileItem(intent.path));
      if (intent.kind === "rename") setRenaming(intent.path);
      if (intent.kind === "copy-path") void copyPath(writeClipboard, toasts, intent.path);
      if (intent.kind === "trash") {
        pendingFocus.current = undefined;
        // Focus goes to the next row, else the previous one, else the folder.
        const rows = visibleRows(roots, shownExpanded);
        const index = rows.findIndex((row) => row.node.path === intent.path);
        const target = (rows[index + 1] ?? rows[index - 1])?.node.path ?? rows[index]?.parent;
        void removeFile(host, toasts, intent.path, {
          removed: () => focusRow(target),
          restored: () => {
            showFile(intent.path);
            focusRow(intent.path);
          },
        });
      }
    },
    [context, host, toasts, writeClipboard, roots, shownExpanded, focusRow, showFile],
  );

  if (loaded.kind === "loading") {
    return (
      <>
        <TitleLine title={title} />
        <div role="status" aria-label={filesWords.loading} className="grid gap-3 p-3">
          {skeletonWidths.map((width) => (
            <SkeletonBar key={width} kind="title" width={width} />
          ))}
        </div>
      </>
    );
  }
  if (loaded.kind === "error") {
    return (
      <>
        <TitleLine title={title} />
        <EmptyState
          tone="error"
          plain
          title={filesWords.errorTitle}
          description={loaded.reason}
          action={{
            label: filesWords.retry,
            busy: retrying,
            busyLabel: filesWords.retrying,
            onClick: () => {
              setRetrying(true);
              void load(() => false).finally(() => setRetrying(false));
            },
          }}
        />
      </>
    );
  }
  // Only a focused folder gives the new path its start; a focused file leaves it at the default.
  const files = loaded.listing.paths;
  const focused = state.focus;
  const folder = focused !== undefined && !files.includes(focused) ? focused : undefined;
  const tree = (
    <FilesTree
      roots={roots}
      state={search.state}
      onStateChange={search.onStateChange}
      onIntent={onIntent}
      {...(renaming === undefined
        ? {}
        : {
            renaming: {
              path: renaming,
              onApply: (name: string, left: () => boolean) => applyRename(renaming, name, left),
              check,
              impact,
              onStranded,
              onCancel: (blur: boolean) => {
                setRenaming(undefined);
                setReveal({ path: renaming, focus: !blur });
              },
            },
          })}
      {...(reveal === undefined
        ? {}
        : { revealPath: reveal.path, revealFocus: reveal.focus, onRevealed: clearReveal })}
      {...(activePath === undefined ? {} : { activePath })}
    />
  );
  // `workspace.yaml` alone stays a row, with a quiet line under it and no button: the + is the way in.
  const onlyWorkspaceFile = files.every((path) => path === "workspace.yaml");
  const nothingFound = search.searching && search.matches === 0;
  const body = nothingFound ? null : (
    <>
      {tree}
      {onlyWorkspaceFile && (
        <p className="px-3 py-2 text-small text-fg-muted">
          {filesWords.emptyTitle} {filesWords.emptyDescription}
        </p>
      )}
    </>
  );
  return (
    <div ref={root} className="flex min-h-0 flex-col">
      <TitleLine title={title}>
        <Button
          ref={addButton}
          variant="ghost"
          size="sm"
          icon={<PlusIcon />}
          label={filesWords.newFile}
          onClick={startAdding}
        />
      </TitleLine>
      <div className="px-5 pt-1 pb-2">
        <SearchField
          label={filesWords.search}
          value={search.typed}
          onChange={(event) => typeSearch(event.target.value)}
          onKeyDown={(event) => {
            // Escape empties the field first; with nothing typed it is left to the page.
            if (event.key !== "Escape" || search.typed === "") return;
            event.preventDefault();
            event.stopPropagation();
            typeSearch("");
          }}
        />
      </div>
      <TreeSearchStatus
        searching={search.searching}
        typed={search.typed}
        matches={search.matches}
      />
      {body}
      {adding && (
        <NewFileDialog
          host={host}
          start={startingPath(folder)}
          returnFocus={() => (opener.current?.isConnected ? opener.current : addButton.current)}
          onCancel={() => setAdding(false)}
          onCreated={(path) => {
            setAdding(false);
            toasts?.show({ tone: "success", title: filesWords.created(path) });
            askFocusOnOpen(path);
            context.openItem?.(fileItem(path));
          }}
        />
      )}
    </div>
  );
}
