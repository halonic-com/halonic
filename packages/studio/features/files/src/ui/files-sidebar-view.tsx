import { EmptyState, SkeletonBar } from "@halonicjs/studio-kit";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FilesHostService, type FilesListing } from "../files-host.ts";
import { filesWords } from "../files-words.ts";
import { emptyTreeState, type TreeState } from "../tree/tree-keyboard.ts";
import { buildTree } from "../tree/tree-model.ts";
import { FilesTree } from "./files-tree.tsx";

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

  const load = useCallback(
    (cancelled: () => boolean) =>
      host.list().then(
        (listing) => {
          if (!cancelled()) setLoaded({ kind: "ready", listing });
        },
        (error: unknown) => {
          if (cancelled()) return;
          const reason = error instanceof Error ? error.message : String(error);
          setLoaded({ kind: "error", reason });
        },
      ),
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
  if (roots.length === 0) {
    return (
      <EmptyState plain title={filesWords.emptyTitle} description={filesWords.emptyDescription} />
    );
  }
  return <FilesTree roots={roots} state={state} onStateChange={setState} />;
}
