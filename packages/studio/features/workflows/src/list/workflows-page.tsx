import { EmptyState } from "@halonicjs/studio-kit";
import { OverviewPage, type PlaceViewProps } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type WorkflowListing,
  type WorkflowRef,
  type WorkflowsHost,
  WorkflowsHostService,
} from "../api.ts";
import { NewWorkflowDialog } from "../new/new-workflow-dialog.tsx";
import { failureReason, listWords } from "./list-words.ts";
import { rowId, workflowHubs } from "./workflow-rows.tsx";

/** Whether the workflows have loaded: the skeleton, the reason they didn't, or the list. */
type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly reason: string }
  | { readonly kind: "ready"; readonly listings: readonly WorkflowListing[] };

/** The Workflows place's page: the open workspace's workflows, from `WorkflowsHostService`. */
export function WorkflowsPage({ context }: PlaceViewProps) {
  const { openItem } = context;
  const open =
    openItem === undefined
      ? undefined
      : (ref: WorkflowRef) => openItem({ kind: "workflow", hub: ref.hubId, id: ref.id });
  return (
    <WorkflowsView host={context.services.get(WorkflowsHostService)} {...(open ? { open } : {})} />
  );
}

/** Props for {@link WorkflowsView}. */
export interface WorkflowsViewProps {
  readonly host: WorkflowsHost;
  /** Opens a workflow's page in a tab: a row's click, Enter, and a workflow just created. */
  readonly open?: (ref: WorkflowRef) => void;
}

/**
 * The Workflows list (`workflows.list`): "Workflows", its sentence, then the shell's list page with
 * a row per workflow and **New workflow**. It reads the host again when the host says the workflows
 * may have changed, and keeps the rows it has while that read runs, so a refresh never blanks the list.
 *
 * @example
 * <WorkflowsView host={host} open={openWorkflowTab} />
 */
export function WorkflowsView({ host, open }: WorkflowsViewProps) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [creating, setCreating] = useState(false);

  // Each read takes a number; only the newest read's result is shown, so a slow older read never
  // overwrites a newer one, and nothing is set after unmount.
  const newestRead = useRef(0);

  const read = useCallback(() => {
    const mine = ++newestRead.current;
    host.list().then(
      (listings) => {
        if (mine === newestRead.current) setLoad({ kind: "ready", listings });
      },
      (error: unknown) => {
        if (mine === newestRead.current) setLoad({ kind: "failed", reason: failureReason(error) });
      },
    );
  }, [host]);

  useEffect(() => {
    read();
    const unsubscribe = host.subscribe(read);
    return () => {
      unsubscribe();
      newestRead.current += 1;
    };
  }, [host, read]);

  const listings = load.kind === "ready" ? load.listings : [];
  const openRow = (id: string) => {
    const listing = listings.find((each) => rowId(each) === id);
    if (listing !== undefined) open?.(listing);
  };
  const startCreating = () => setCreating(true);

  return (
    <div className="flex w-full flex-col gap-4 px-6 py-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-title">{listWords.title}</h1>
        {(listings.length > 0 || load.kind !== "ready") && (
          <p className="text-body text-fg-muted">{listWords.sentence}</p>
        )}
      </header>
      {load.kind === "failed" ? (
        <EmptyState
          tone="error"
          title={listWords.loadFailedTitle}
          description={load.reason}
          action={{ label: "Try again", onClick: read }}
        />
      ) : (
        <OverviewPage
          hubs={workflowHubs(host.hubs(), listings)}
          words={{
            searchLabel: listWords.searchLabel,
            loadingLabel: listWords.loadingLabel,
            chipsLabel: listWords.chipsLabel,
            allChip: listWords.allChip,
            sharedChip: (workspace) => workspace,
            moreLabel: listWords.more,
            sharedSection: (workspace) => workspace,
            emptySection: (hubName) => listWords.emptyHub(hubName),
            noMatch: listWords.noMatch,
            nothingYet: {
              title: listWords.nothingYetTitle,
              description: listWords.sentence,
              action: { label: listWords.newWorkflow, onClick: startCreating },
            },
          }}
          loading={load.kind === "loading"}
          quietWhenEmpty
          newButton={{ label: listWords.newWorkflow, onClick: startCreating }}
          onOpen={openRow}
          onOpenInNewTab={openRow}
        />
      )}
      {creating && (
        <NewWorkflowDialog
          hubs={host.hubs()}
          takenIds={(hubId) =>
            listings.filter((listing) => listing.hubId === hubId).map((listing) => listing.id)
          }
          create={(newWorkflow) => host.create(newWorkflow)}
          onCreated={(ref) => {
            setCreating(false);
            read();
            open?.(ref);
          }}
          onCancel={() => setCreating(false)}
          returnFocus={() => null}
        />
      )}
    </div>
  );
}
