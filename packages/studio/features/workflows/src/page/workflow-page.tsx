import {
  Button,
  EmptyState,
  SkeletonBar,
  type Tab,
  TabList,
  TabPanel,
  useTabIds,
} from "@halonicjs/studio-kit";
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { useState } from "react";
import { type WorkflowsHost, WorkflowsHostService } from "../api.ts";
import { Configuration } from "../configuration/configuration-page.tsx";
import { configurationWords } from "../configuration/configuration-words.ts";
import { countProblems } from "../configuration/problem-lines.ts";
import { Avatar } from "../list/workflow-rows.tsx";
import { pageWords } from "./page-words.ts";
import { useHostRead, useWorkflow } from "./use-workflow.ts";
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
  const name = load.kind === "ready" ? load.value.name : id;
  const settings = useHostRead(host, { hubId, id }, (one, ref) => one.configuration(ref));
  const [view, setView] = useState<"flow" | "configuration">("flow");
  const [openStep, setOpenStep] = useState<string | undefined>();
  const ids = useTabIds();
  const errors =
    settings.load.kind === "ready" ? countProblems(settings.load.value.problems).errors : 0;
  const views: readonly Tab<"flow" | "configuration">[] = [
    { id: "flow", label: configurationWords.flowTab },
    {
      id: "configuration",
      label: configurationWords.tab,
      ...(errors > 0 && {
        count: {
          value: errors,
          tone: "danger" as const,
          name: configurationWords.errors(errors),
        },
      }),
    },
  ];
  return (
    <div className="flex size-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-border px-6 py-3">
        <Avatar name={name} />
        <div className="flex flex-col">
          <p className="text-caption text-fg-muted">{pageWords.kind}</p>
          <h1 className="text-title">{name}</h1>
        </div>
        <TabList
          label={configurationWords.tabs}
          tabs={views}
          selected={view}
          onSelect={(next) => {
            // A direct tab click must not re-pick the card a problem link opened.
            setOpenStep(undefined);
            setView(next);
          }}
          ids={ids}
        />
      </header>
      <TabPanel ids={ids} tabs={views} selected={view}>
        {view === "configuration" ? (
          <Configuration
            name={name}
            load={settings.load}
            retry={settings.retry}
            onOpenStep={(stepId) => {
              setOpenStep(stepId);
              setView("flow");
            }}
          />
        ) : (
          <>
            {load.kind === "ready" && (
              <WorkflowCanvas
                key={`${hubId}/${id}/${openStep}`}
                workflow={load.value}
                selectedStep={openStep}
              />
            )}
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
          </>
        )}
      </TabPanel>
    </div>
  );
}
