import {
  Button,
  CommandBox,
  EmptyState,
  SkeletonBar,
  type Tab,
  TabList,
  TabPanel,
  usePresentation,
  useTabIds,
} from "@halonicjs/studio-kit";
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { useCallback, useState } from "react";
import { type WorkflowsHost, WorkflowsHostService } from "../api.ts";
import type { View } from "../canvas/geometry.ts";
import { Configuration } from "../configuration/configuration-page.tsx";
import { configurationWords } from "../configuration/configuration-words.ts";
import { countProblems } from "../configuration/problem-lines.ts";
import { Avatar } from "../list/workflow-rows.tsx";
import { TestsPage } from "../tests/tests-page.tsx";
import { pageWords } from "./page-words.ts";
import { useHostRead, useWorkflow } from "./use-workflow.ts";
import { WorkflowCanvas } from "./workflow-canvas.tsx";

/** The workflow's page in its tab: `item` names the workflow, the host gives its steps. */
export function WorkflowPage({ item, context }: ItemViewProps) {
  const { openItem } = context;
  return (
    <WorkflowScreen
      host={context.services.get(WorkflowsHostService)}
      hubId={item.hub}
      id={item.id}
      {...(openItem && {
        openRun: (runId: string) => openItem({ kind: "run", hub: item.hub, id: runId }),
      })}
    />
  );
}

/** Props for {@link WorkflowScreen}. */
export interface WorkflowScreenProps {
  readonly host: WorkflowsHost;
  readonly hubId: string;
  readonly id: string;
  /** Opens a test run's card from the Tests page; absent where there is no run card. */
  readonly openRun?: (runId: string) => void;
}

/**
 * The workflow page's frame (`workflows.page`): full width, with no ⤢, no ✕ and no chat column
 * until the Assistant lands. The header has the letter avatar, "WORKFLOW" and the name; under it
 * is the canvas, a skeleton when the file takes over 300 ms, or why it couldn't be read.
 */
export function WorkflowScreen({ host, hubId, id, openRun }: WorkflowScreenProps) {
  const { load, retry } = useWorkflow(host, { hubId, id });
  const name = load.kind === "ready" ? load.value.name : id;
  const settings = useHostRead(host, { hubId, id }, (one, ref) => one.configuration(ref));
  const everyWorkflow = useHostRead(host, { hubId, id }, (one) => one.list());
  const [view, setView] = useState<"flow" | "configuration">("flow");
  // The canvas unmounts on Configuration, so the page keeps its zoom and pan (D9). They belong to
  // one workflow: the same screen can be handed another, which opens fitted.
  const [kept, setKept] = useState<{ readonly of: string; readonly view: View } | undefined>();
  const workflowKey = `${hubId}/${id}`;
  const keep = useCallback((next: View) => setKept({ of: workflowKey, view: next }), [workflowKey]);
  const [openStep, setOpenStep] = useState<string | undefined>();
  const ids = useTabIds();
  const phone = usePresentation() === "phone";
  const errors =
    settings.load.kind === "ready" ? countProblems(settings.load.value.problems).errors : 0;
  // `halonic run reply` stops when two hubs have a `reply`, so the command then names the hub.
  const inSeveralHubs =
    everyWorkflow.load.kind === "ready" &&
    everyWorkflow.load.value.some((one) => one.id === id && one.hubId !== hubId);
  const startCommand = inSeveralHubs ? `halonic run ${hubId}/${id}` : `halonic run ${id}`;
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
      <header
        className={
          phone
            ? "flex flex-col gap-3 border-b border-border px-4 py-3"
            : "flex items-center gap-3 border-b border-border px-6 py-3"
        }
      >
        {/* On a phone the top bar already names the workflow, so the page keeps only its type. */}
        <div className="flex items-center gap-3">
          <Avatar name={name} />
          <div className="flex flex-col">
            <p className="text-caption text-fg-muted">{pageWords.kind}</p>
            <h1 className={phone ? "sr-only" : "text-title"}>{name}</h1>
          </div>
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
      {settings.load.kind === "ready" && errors === 0 && (
        <div
          data-testid="start-command"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-6 py-2 text-small text-fg-muted"
        >
          <p>{pageWords.startIt}</p>
          <CommandBox command={startCommand} />
        </div>
      )}
      <TabPanel ids={ids} tabs={views} selected={view}>
        {view === "configuration" ? (
          <Configuration
            name={name}
            load={settings.load}
            retry={settings.retry}
            tests={<TestsPage host={host} workflow={{ hubId, id }} name={name} openRun={openRun} />}
            onOpenStep={(stepId) => {
              setOpenStep(stepId);
              setView("flow");
            }}
          />
        ) : (
          <>
            {load.kind === "ready" && load.value.id === id && load.value.hubId === hubId && (
              <WorkflowCanvas
                key={`${hubId}/${id}/${openStep}`}
                workflow={load.value}
                selectedStep={openStep}
                saved={kept?.of === workflowKey ? kept.view : undefined}
                onView={keep}
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
