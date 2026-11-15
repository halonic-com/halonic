import { Button, EmptyState, SkeletonBar } from "@halonicjs/studio-kit";
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { type WorkflowsHost, WorkflowsHostService } from "../api.ts";
import { Avatar } from "../list/workflow-rows.tsx";
import { pageWords } from "./page-words.ts";
import { useWorkflow } from "./use-workflow.ts";
import { WorkflowCanvas } from "./workflow-canvas.tsx";

/** The workflow's page in its tab: `item` names the workflow, the host gives its steps. */
export function WorkflowPage({ item, context }: ItemViewProps) {
  return (
    <WorkflowScreen
      host={context.services.get(WorkflowsHostService)}
      hubId={item.hub}
      id={item.id}
    />
  );
}

/** Props for {@link WorkflowScreen}. */
export interface WorkflowScreenProps {
  readonly host: WorkflowsHost;
  readonly hubId: string;
  readonly id: string;
}

/**
 * The workflow page's frame (`workflows.page`): full width, with no ⤢, no ✕ and no chat column
 * until the Assistant lands. The header has the letter avatar, "WORKFLOW" and the name; under it
 * is the canvas, a skeleton when the file takes over 300 ms, or why it couldn't be read.
 */
export function WorkflowScreen({ host, hubId, id }: WorkflowScreenProps) {
  const { load, retry } = useWorkflow(host, { hubId, id });
  const name = load.kind === "ready" ? load.workflow.name : id;
  return (
    <div className="flex size-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-border px-6 py-3">
        <Avatar name={name} />
        <div className="flex flex-col">
          <p className="text-caption text-fg-muted">{pageWords.kind}</p>
          <h1 className="text-title">{name}</h1>
        </div>
      </header>
      {load.kind === "ready" && <WorkflowCanvas key={`${hubId}/${id}`} workflow={load.workflow} />}
      {load.kind === "failed" && (
        <EmptyState
          tone="error"
          title={pageWords.loadFailedTitle}
          description={load.reason}
          action={{ label: pageWords.tryAgain, onClick: retry }}
        />
      )}
      {load.kind === "loading" && load.skeleton && (
        <div role="status" className="flex flex-1 flex-col gap-4 p-6">
          <span className="sr-only">{pageWords.loading(name)}</span>
          <div className="flex gap-6">
            <SkeletonBar kind="value" />
            <SkeletonBar kind="value" />
          </div>
          {load.slow && (
            <p className="flex items-center gap-3 text-small text-fg-muted">
              {pageWords.stillLoading}
              <Button variant="secondary" size="sm" onClick={retry}>
                {pageWords.tryAgain}
              </Button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
