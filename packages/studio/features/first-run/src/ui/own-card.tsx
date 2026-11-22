import { AgentsHostService } from "@halonicjs/studio-feature-agents/api";
import {
  ModelKeysService,
  ModelsFilesService,
  ProviderCheckService,
} from "@halonicjs/studio-feature-models/api";
import { RunsListService } from "@halonicjs/studio-feature-runs/api";
import { type SetupStep, SetupSteps } from "@halonicjs/studio-kit";
import {
  type HomeCardProps,
  HomeSectionEmpty,
  type WorkspaceContext,
} from "@halonicjs/studio-shell";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { FirstRunService, SampleWorkspaceService } from "../api.ts";
import { type OwnStepId, ownCardWords, ownStepWords } from "../own-card-words.ts";
import { DEFAULT_ALIAS } from "../own-progress.ts";
import { OwnSteps, type OwnStepsState } from "../own-steps.ts";

/**
 * Home's Get set up in a workspace that isn't the sample (`first-run.own-card`): the three steps
 * with "N of 3 done" above them, or "You're set up." once all three are. Nothing shows in the
 * sample, while the first run is on here, or where the app gives no agents or files to read.
 */
export function OwnCard({ context }: HomeCardProps) {
  const firstRun = context.services.get(FirstRunService);
  const [steps] = useState(() =>
    firstRun.isDemo || firstRun.isOnHere ? undefined : ownStepsOf(context),
  );
  if (steps === undefined) return <HomeSectionEmpty />;
  return <OwnStepsCard steps={steps} context={context} />;
}

/** The steps of one visit to Home, read from the open workspace's services. */
function ownStepsOf(context: WorkspaceContext): OwnSteps | undefined {
  const { services } = context;
  const files = services.find(ModelsFilesService);
  const agents = services.find(AgentsHostService);
  if (files === undefined || agents === undefined) return undefined;
  return new OwnSteps({
    files,
    agents,
    runs: services.get(RunsListService),
    keys: services.find(ModelKeysService),
    check: services.find(ProviderCheckService),
    memory: services.get(SampleWorkspaceService),
    now: () => new Date(),
  });
}

/** The card's state while it shows. */
type Showing = Extract<OwnStepsState, { readonly kind: "showing" }>;

/** What each step opens; see {@link ownStepOpeners}. */
type OwnStepOpeners = Readonly<Record<OwnStepId, () => void>>;

/**
 * What each step opens (flow-first-run 5.2). Step 1 opens Models with the `default` alias open.
 * Step 2 opens New agent, which writes the Default hub where there's none. Step 3 opens the last
 * agent's page, and before there's an agent does what step 2 does.
 */
export function ownStepOpeners(
  context: Pick<WorkspaceContext, "openItem" | "runCommand">,
  lastAgent: Showing["lastAgent"],
): OwnStepOpeners {
  const { openItem, runCommand } = context;
  const openModels = () => {
    if (openItem === undefined) return void runCommand?.("workspace.open-models");
    openItem({ kind: "model-alias", hub: "local", id: DEFAULT_ALIAS });
  };
  const newAgent = () => void runCommand?.("agents.new");
  // The agent's page until its Try it lands (HAL-13177), which this one line then opens.
  const runAgent = () => {
    if (lastAgent === undefined || openItem === undefined) return newAgent();
    openItem({ kind: "agent", hub: lastAgent.hubId, id: lastAgent.id });
  };
  return { model: openModels, agent: newAgent, run: runAgent };
}

/** Props for {@link OwnStepsCard}. */
interface OwnStepsCardProps {
  readonly steps: OwnSteps;
  readonly context: WorkspaceContext;
}

function OwnStepsCard({ steps, context }: OwnStepsCardProps) {
  const subscribe = useCallback((listener: () => void) => steps.subscribe(listener), [steps]);
  const state = useSyncExternalStore(subscribe, () => steps.state);
  useEffect(() => steps.start(), [steps]);
  // The section shows its own error, with Try again, which mounts the card again.
  if (state.kind === "failed") throw state.error;
  if (state.kind !== "showing") return <HomeSectionEmpty />;
  const openers = ownStepOpeners(context, state.lastAgent);
  const rows: SetupStep<OwnStepId>[] = [
    modelRow(state, openers.model, () => void steps.checkModel()),
    plainRow("agent", 2, state.agentDone),
    plainRow("run", 3, state.runDone),
  ];
  const done = rows.filter((row) => row.done).length;
  return (
    <>
      <p className="px-4 pb-2 text-small text-fg-muted">{ownCardWords.caption(done)}</p>
      <SetupSteps label={ownCardWords.heading} steps={rows} onOpen={(id) => openers[id]()} />
      {done === rows.length ? (
        <p className="px-4 pt-2 text-small text-fg">{ownCardWords.finished}</p>
      ) : null}
    </>
  );
}

function plainRow(id: "agent" | "run", number: number, done: boolean): SetupStep<OwnStepId> {
  const { title, hint } = ownStepWords[id];
  const label = ownCardWords.stepLabel(number, title, done ? "done" : "not done");
  return { id, title, hint, done, label };
}

/** Step 1's row: with the waiting line while it asks a local provider, and its problem when that doesn't answer. */
function modelRow(
  { model, providerName }: Showing,
  openModels: () => void,
  checkAgain: () => void,
): SetupStep<OwnStepId> {
  const { title, hint } = ownStepWords.model;
  const done = model.status === "done";
  const row = { id: "model", title, hint, done } as const;
  if (model.status === "checking") {
    const where =
      model.address === undefined ? null : (
        <>
          {" "}
          at <code>{model.address}</code>
        </>
      );
    const what = (
      <>
        {ownCardWords.checking(providerName)}
        {where}…
      </>
    );
    const label = ownCardWords.stepLabel(1, title, "not done");
    return { ...row, label, check: { state: "checking", what, since: model.since } };
  }
  if (model.status === "not-answering") {
    const cause = ownCardWords.notAnswering(providerName, model.address);
    const actions = [
      { label: ownCardWords.checkAgain, onClick: checkAgain },
      { label: ownCardWords.openModels, onClick: openModels },
    ];
    const label = ownCardWords.stepLabel(1, title, "problem");
    return { ...row, label, check: { state: "problem", cause, actions } };
  }
  return { ...row, label: ownCardWords.stepLabel(1, title, done ? "done" : "not done") };
}
