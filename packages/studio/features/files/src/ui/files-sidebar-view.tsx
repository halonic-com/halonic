import { Button, EmptyState, PlusIcon, SkeletonBar, useToastStore } from "@halonicjs/studio-kit";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FILE_KIND, fileItem } from "../file-item.ts";
import { FilesHostService, type FilesListing } from "../files-host.ts";
import { filesWords } from "../files-words.ts";
import { startingPath } from "../new-file.ts";
import { removeFile } from "../remove-file.ts";
import { emptyTreeState, type TreeIntent, type TreeState } from "../tree/tree-keyboard.ts";
import { buildTree } from "../tree/tree-model.ts";
import { FilesTree } from "./files-tree.tsx";
import { NewFileDialog } from "./new-file-dialog.tsx";
import { RenameFileDialog } from "./rename-file-dialog.tsx";

/** What the sidebar's Files view gets: the context of the feature that added it. */
export interface FilesSidebarViewProps {
  readonly context: WorkspaceContext;
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
export function FilesSidebarView({ context }: FilesSidebarViewProps) {
  const host = context.services.get(FilesHostService);
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  const [state, setState] = useState<TreeState>(emptyTreeState);
  const [retrying, setRetrying] = useState(false);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string>();
  const toasts = useToastStore();
  const addButton = useRef<HTMLButtonElement>(null);
  // The New file button that opened the dialog, the top one or the empty state's, gets focus back.
  const opener = useRef<HTMLElement | null>(null);
  const startAdding = useCallback(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAdding(true);
  }, []);

  const latest = useRef(0);

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
          const reason = error instanceof Error ? error.message : String(error);
          setLoaded({ kind: "error", reason });
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

  const onIntent = useCallback(
    (intent: TreeIntent) => {
      if (intent.kind === "open") context.openItem?.(fileItem(intent.path));
      if (intent.kind === "rename") setRenaming(intent.path);
      if (intent.kind === "trash") void removeFile(host, toasts, intent.path);
    },
    [context, host, toasts],
  );

  const roots = useMemo(
    () => (loaded.kind === "ready" ? buildTree(loaded.listing.paths, loaded.listing.marks) : []),
    [loaded],
  );

  if (loaded.kind === "loading") {
    return (
      <div role="status" aria-label={filesWords.loading} className="grid gap-3 p-3">
        {skeletonWidths.map((width) => (
          <SkeletonBar key={width} kind="title" width={width} />
        ))}
      </div>
    );
  }
  if (loaded.kind === "error") {
    return (
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
    );
  }
  // Only a focused folder gives the new path its start; a focused file leaves it at the default.
  const files = loaded.listing.paths;
  const focused = state.focus;
  const folder = focused !== undefined && !files.includes(focused) ? focused : undefined;
  const body =
    roots.length === 0 ? (
      <EmptyState
        plain
        title={filesWords.emptyTitle}
        description={filesWords.emptyDescription}
        action={{ label: filesWords.newFile, onClick: startAdding }}
      />
    ) : (
      <FilesTree
        roots={roots}
        state={state}
        onStateChange={setState}
        onIntent={onIntent}
        {...(activePath === undefined ? {} : { activePath })}
      />
    );
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-end px-2 pt-1">
        <Button
          ref={addButton}
          variant="ghost"
          size="sm"
          icon={<PlusIcon />}
          label={filesWords.newFile}
          onClick={startAdding}
        />
      </div>
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
            context.openItem?.(fileItem(path));
          }}
        />
      )}
      {renaming !== undefined && (
        <RenameFileDialog
          host={host}
          path={renaming}
          returnFocus={() => document.querySelector<HTMLElement>("[data-path][tabindex='0']")}
          onCancel={() => setRenaming(undefined)}
          onRenamed={(path) => {
            setRenaming(undefined);
            toasts?.show({ tone: "success", title: filesWords.renamed(path) });
            context.openItem?.(fileItem(path));
          }}
        />
      )}
    </div>
  );
}
