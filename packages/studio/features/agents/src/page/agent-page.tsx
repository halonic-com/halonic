import { sandboxStartCheckKey } from "@halonicjs/app";
import { ShowInChatService } from "@halonicjs/studio-feature-assistant/api";
import { PlaceIcon, usePresentation } from "@halonicjs/studio-kit";
import {
  changeMarkSelector,
  createCloseStack,
  ItemGone,
  ItemPage,
  type ItemPageHandle,
  type ItemViewProps,
  StackedCards,
  useItemReview,
} from "@halonicjs/studio-shell";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type AgentChange,
  type AgentRef,
  type AgentRoutine,
  type AgentsHost,
  AgentsHostService,
  type AgentToolList,
  type AgentUser,
  selectStepsStep,
} from "../api.ts";
import { keyFieldOpener } from "../chat/key-field.ts";
import { TryItPanel } from "../chat/try-it-panel.tsx";
import {
  Configuration,
  type ConfigurationPage,
  type ConfigurationStart,
} from "../configuration/configuration.tsx";
import { errorTotal, useConfigurationErrors } from "../configuration/configuration-errors.ts";
import { useConfigurationLoads } from "../configuration/use-configuration-loads.ts";
import { PlacementProvider } from "../configuration/use-placement.ts";
import { FlowView } from "../map/flow-view.tsx";
import { pageOfChange, ReviewMarksContext } from "../review/review-marks.tsx";
import { AgentReviewService } from "../review-api.ts";
import { fileItemOf } from "../trash/file-item.ts";
import { useAgentTrash } from "../trash/use-agent-trash.tsx";
import { WHERE_IT_RUNS_STEP } from "../where-it-runs-step.ts";
import { AgentPhoneFrame } from "./agent-phone-frame.tsx";
import { AgentRead } from "./agent-read.tsx";
import type { AgentScreenProps } from "./agent-screen-props.ts";
import { FullAccessChip } from "./full-access-chip.tsx";
import { nameProblem } from "./name-check.ts";
import { NotLiveLine } from "./not-live-line.tsx";
import { PageCard } from "./page-card.tsx";
import { pageWords } from "./page-words.ts";
import { RunsView } from "./runs-view.tsx";
import { showInChatEntry } from "./show-in-chat-entry.ts";
import { useAgentCards } from "./use-agent-cards.ts";
import { type AgentView, agentTabs, useAgentView } from "./use-agent-view.ts";
import { useLoad } from "./use-load.ts";
import { useTakenNames } from "./use-taken-names.ts";
import { focusAfterAdd, focusedIn, mapAdds, pickedPageTab } from "./view-opening.ts";

/**
 * The Library's commands that open it on a tab (`library.skill` and so on); the Agents feature
 * can't import the Library, so it runs them by id.
 */
const libraryTabCommands: Readonly<Record<AgentToolList, string>> = {
  skills: "library.skill",
  knowledge: "library.knowledge",
  connectors: "library.connector",
};

/** The step that opens an agent's page at its model, as `openItem(agent, { step: "model" })`. */
export const MODEL_STEP = "model";

/**
 * The agent's page in its tab: `item` names the agent, the host reads its row. Opened with the
 * step `model`, it opens at the model picker (`agents.configuration.open-at-model`); with
 * {@link WHERE_IT_RUNS_STEP}, at Configuration › Harness (`agents.confirm-again.run-controls`).
 */
export function AgentPage({ item, context, step, asked, Sections, sections }: ItemViewProps) {
  const { openPlace, openItem, openItemInNewTab, runCommand, closeStack, announcer } = context;
  const announce = useCallback(
    (text: string, politeness?: "polite" | "assertive") => announcer.announce(text, politeness),
    [announcer],
  );
  const host = context.services.get(AgentsHostService);
  const assistant = context.services.find(ShowInChatService);
  // The warning's file link opens a tab beside this one, so Review and confirm stays where it was.
  const openFileBeside = openItemInNewTab && ((path: string) => openItemInNewTab(fileItemOf(path)));
  // One read of where the agent runs, so the header's chip follows a choice in Where it runs.
  return (
    <PlacementProvider host={host} hubId={item.hub} id={item.id} openFile={openFileBeside}>
      <AgentScreen
        host={host}
        saving={context.saving}
        hubId={item.hub}
        id={item.id}
        sections={sections}
        Sections={Sections}
        {...(step === MODEL_STEP && { modelRequest: `${item.id}/${asked ?? 0}` })}
        {...(step === WHERE_IT_RUNS_STEP && { harnessRequest: `${item.id}/${asked ?? 0}` })}
        {...(openPlace && {
          goToAgents: () => openPlace("agents"),
          openRuns: () => openPlace("runs"),
        })}
        {...(openItem && { openFile: (path: string) => openItem(fileItemOf(path)) })}
        {...(runCommand && {
          openLibrary: (list: AgentToolList) => runCommand(libraryTabCommands[list]),
        })}
        openKeyField={keyFieldOpener(context)}
        closeStack={closeStack}
        announce={announce}
        sandboxStartCheck={context.services.find(sandboxStartCheckKey)}
        review={context.services.find(AgentReviewService)}
        {...(assistant && {
          showInChat: {
            label: assistant.label,
            show: (name: string) => void assistant.show({ item, name }, context),
          },
        })}
        {...(openItem && {
          openAgent: (agent: AgentRef) =>
            openItem({ kind: "agent", hub: agent.hubId, id: agent.id }),
          openWorkflow: (workflow: AgentUser) =>
            openItem(
              { kind: "workflow", hub: workflow.hubId, id: workflow.id },
              { step: selectStepsStep(workflow.stepIds) },
            ),
          openRoutine: ({ hubId: hub, id: routine }: AgentRoutine) => {
            // A routine at the workspace's root has no page of its own yet, as on the Routines list.
            if (hub !== null) openItem({ kind: "routine", hub, id: routine });
          },
        })}
      />
    </PlacementProvider>
  );
}

/**
 * The agent page (`agents.page.frame`): the shell's item page, with "AGENT" and the agent's name in
 * its header, the Try it chat on the left (`agents.chat.first-load`, flow-agents 3.1) and the
 * agent's Flow (the agent map), Configuration or Runs in the panel beside it, open on Flow. On a
 * phone the views fill the page under the letter avatar. The panel is a skeleton when the read
 * takes over 300 ms, and says why when the agent can't be read.
 */
export function AgentScreen({
  host,
  saving,
  hubId,
  id,
  goToAgents,
  openFile,
  openLibrary,
  openRuns,
  openKeyField,
  closeStack,
  announce,
  openAgent,
  openWorkflow,
  openRoutine,
  sections,
  Sections,
  modelRequest,
  harnessRequest,
  sandboxStartCheck,
  review,
  showInChat,
}: AgentScreenProps) {
  // After a Try again reads, or the not-live line goes, the agent's name takes the focus the button had.
  const title = useRef<HTMLHeadingElement>(null);
  const source = useMemo(
    () => ({
      fetch: () => host.read({ hubId, id }),
      subscribe: (onChange: () => void) => host.subscribe(onChange),
    }),
    [host, hubId, id],
  );
  const phone = usePresentation() === "phone";
  const { load, retry: retryAgent } = useLoad(source, () => title.current?.focus());
  const { settings, aliases, defaultModel } = useConfigurationLoads(host, { hubId, id });
  const errors = useConfigurationErrors(host, { hubId, id }, settings.load, aliases.load);
  const views = agentTabs(errorTotal(errors));
  // The chat's first load is the agent's (v0.1), so one Try again reads the agent and its settings.
  const retry = () => {
    retryAgent();
    settings.retry();
  };
  const takenNames = useTakenNames(host, { hubId, id });
  const { view, selectView, fresh, modelWaiting, modelShown } = useAgentView(
    hubId,
    id,
    modelRequest,
  );
  const [configurationPage, setConfigurationPage] = useState<ConfigurationPage>("behaviour");
  // The page an add button on the map opens Configuration on; picking a view by hand forgets it.
  const [configurationStart, setConfigurationStart] = useState<ConfigurationStart>();
  // On a desktop the shell's item page keeps the view, so the page learns it as each view is drawn.
  const shownView = useRef<AgentView>(view);
  const cards = useAgentCards(host, { hubId, id }, announce, () => shownView.current !== "runs");
  const viewBox = useRef<HTMLDivElement>(null);
  const itemPage = useRef<ItemPageHandle<AgentView>>(null);
  // Picking another view closes the stack: cards belong to the view they opened over (flow-agents 7).
  // Configuration then opens on Behaviour again, as when it was drawn anew, or on the page an add
  // button on the map asks for.
  const pickView = (next: AgentView, start?: ConfigurationStart) => {
    if (next !== shownView.current) cards.close();
    if (next !== shownView.current || start !== undefined) {
      setConfigurationPage(start?.page ?? "behaviour");
    }
    setConfigurationStart(start);
    selectView(next);
  };
  // A view the page opens itself is shown as a pick would show it, with focus on `focus()`'s
  // element: the shell reopens a closed panel, or its screen in a narrow tab (flow-agents 3.4).
  const openView = (
    next: AgentView,
    focus: () => HTMLElement | null,
    start?: ConfigurationStart,
  ) => {
    pickView(next, start);
    itemPage.current?.show(next, focus);
  };
  // Each request to open at the model shows Configuration again, where the picker takes the focus.
  useEffect(() => {
    if (modelRequest !== undefined) {
      itemPage.current?.show("configuration", () => focusedIn(viewBox.current));
    }
  }, [modelRequest]);
  // Configuration › Harness, where Where it runs is: the Try it chat's link and each request open it.
  const openHarness = () => {
    openView("configuration", () => pickedPageTab(viewBox.current));
    setConfigurationPage("harness");
  };
  const openHarnessNow = useRef(openHarness);
  openHarnessNow.current = openHarness;
  useEffect(() => {
    if (harnessRequest !== undefined) openHarnessNow.current();
  }, [harnessRequest]);
  const ownCloseStack = useMemo(() => createCloseStack(), []);
  const cardsCloseStack = closeStack ?? ownCloseStack;
  const [saveFailed, setSaveFailed] = useState<string>();
  // While the agent is read, the name the host already knows, as the tab shows it.
  const name = load.kind === "ready" ? load.value.name : (host.nameOf({ hubId, id }) ?? id);
  // The assistant's changes: Previous and Next open a change's page and focus its mark.
  const changes = useItemReview({
    host: review,
    item: { hubId, id },
    name,
    openFile,
    announce,
    title,
    goTo: (change) =>
      openView(
        "configuration",
        () => viewBox.current?.querySelector<HTMLElement>(changeMarkSelector(change.id)) ?? null,
        { page: pageOfChange(change) },
      ),
  });
  // Resolves to whether the change was written, so a page can put its control back when it wasn't.
  const save = async (change: AgentChange): Promise<boolean> => {
    changes.editing();
    try {
      await host.update({ hubId, id }, change);
      setSaveFailed(undefined);
      return true;
    } catch (error) {
      setSaveFailed(error instanceof Error ? error.message : pageWords.saveFailed);
      return false;
    }
  };
  const reportNotSaved = useCallback(
    (count: number) =>
      saving?.setFieldsNotSaved({ key: `agent/${hubId}/${id}`, title: name }, count),
    [saving, hubId, id, name],
  );
  // After Undo brings a deleted agent back, its name takes the focus once the page is drawn again.
  const focusWhenBack = useRef(false);
  const titleRef = useCallback((heading: HTMLHeadingElement | null) => {
    title.current = heading;
    if (heading !== null && focusWhenBack.current) {
      focusWhenBack.current = false;
      heading.focus();
    }
  }, []);
  const onRestored = useCallback(() => {
    focusWhenBack.current = true;
  }, []);
  const trash = useAgentTrash({ host, agent: { hubId, id }, name, openFile, onRestored });
  // The strip with Undo stands where "isn't in this workspace any more" would.
  if (trash.strip !== null) return trash.strip;
  if (load.kind === "failed" && load.gone === true && goToAgents !== undefined) {
    return <ItemGone kindName="agent" place="Agents" onGoTo={goToAgents} />;
  }

  const ready = load.kind === "ready";
  const notice = (
    <>
      {ready && changes.bar}
      {ready && (
        <NotLiveLine
          host={host}
          agent={{ hubId, id }}
          name={name}
          onMadeLive={() => title.current?.focus()}
        />
      )}
      {saveFailed !== undefined && (
        <p role="alert" className="border-b border-border px-6 py-2 text-small text-danger">
          {pageWords.couldntSave(saveFailed)}
        </p>
      )}
    </>
  );
  // Until the agent is read, its read speaks for the page whichever view is open.
  const drawView = (shown: AgentView): ReactNode => {
    shownView.current = shown;
    return (
      <div ref={viewBox} className="contents">
        <ReviewMarksContext value={changes.marks && { ...changes.marks, agent: { hubId, id } }}>
          {drawViewContent(shown)}
        </ReviewMarksContext>
      </div>
    );
  };
  const drawViewContent = (shown: AgentView): ReactNode => {
    if (!ready) {
      return (
        <div className="min-w-0 flex-1 overflow-auto p-6">
          <AgentRead load={load} name={name} retry={retry} />
        </div>
      );
    }
    if (shown === "runs") {
      return <RunsView host={host} agent={{ hubId, id }} name={name} openRuns={openRuns} />;
    }
    return (
      <StackedCards
        itemPath={[hubName(host, hubId), name]}
        stack={cards.stack}
        onChange={cards.set}
        closeStack={cardsCloseStack}
        // No card on this page docks, so the panel's width doesn't change how they look.
        panelWidth={Number.POSITIVE_INFINITY}
        renderCard={(card) => (
          <PageCard
            card={card}
            host={host}
            hubId={hubId}
            settings={settings.load}
            openSubagent={cards.openSubagent}
            openAgent={openAgent}
            announce={announce}
          />
        )}
      >
        {shown === "flow" ? (
          <FlowView
            host={host}
            agent={{ hubId, id }}
            name={name}
            openAsFile={trash.openAsFile}
            closeStack={cardsCloseStack}
            openAgentStep={cards.openAgentStep}
            openSubagent={cards.openSubagent}
            openAgent={openAgent}
            openWorkflow={openWorkflow}
            openRoutine={openRoutine}
            openTool={openLibrary}
            {...mapAdds(sections, Sections, (start) =>
              openView("configuration", () => focusAfterAdd(viewBox.current), start),
            )}
          />
        ) : (
          <Configuration
            host={host}
            name={name}
            load={settings.load}
            aliases={aliases.load}
            defaultModel={defaultModel}
            retryAliases={aliases.retry}
            retry={settings.retry}
            startOnInstructions={fresh}
            save={save}
            openLibrary={openLibrary}
            openSubagent={cards.openSubagent}
            reportNotSaved={reportNotSaved}
            announce={announce}
            openAgentStep={cards.openAgentStep}
            sections={sections}
            Sections={Sections}
            showModel={modelWaiting}
            onModelShown={modelShown}
            page={configurationPage}
            onPickPage={setConfigurationPage}
            start={configurationStart}
            errors={errors}
          />
        )}
      </StackedCards>
    );
  };

  // The header's Full access chip while the agent runs on this computer (agents.page.full-access-chip).
  const fullAccess = <FullAccessChip host={host} agent={{ hubId, id }} />;
  if (phone) {
    return (
      <AgentPhoneFrame
        name={name}
        titleRef={titleRef}
        menu={
          ready && (
            <>
              {fullAccess}
              {trash.menu}
            </>
          )
        }
        views={views}
        view={view}
        onPickView={pickView}
        notice={notice}
      >
        {drawView(view)}
      </AgentPhoneFrame>
    );
  }
  return (
    <ItemPage<AgentView>
      icon={<PlaceIcon name="agents" />}
      kind={pageWords.kindWord}
      name={name}
      // Until the agent is read there's no name to change.
      onRename={(next) => {
        if (ready) void save({ name: next });
      }}
      check={(next) => nameProblem(next, takenNames)}
      titleRef={titleRef}
      actions={ready ? [...showInChatEntry(showInChat, name, phone), ...trash.actions] : []}
      end={ready && fullAccess}
      views={views}
      firstView={view}
      handle={itemPage}
      onPickView={pickView}
      notice={notice}
      closeStack={closeStack}
      chat={{
        startsOpen: true,
        render: (_close, panelShown) => (
          <TryItPanel
            host={host}
            agent={{ hubId, id }}
            settings={ready ? settings.load : load}
            // One read, one state: the panel's, or the chat's while the panel doesn't show (C516 S-4).
            waiting={
              panelShown ? null : (
                <div className="overflow-auto p-6">
                  <AgentRead load={ready ? settings.load : load} name={name} retry={retry} />
                </div>
              )
            }
            ways={{
              goToKeyField: () => openKeyField?.(),
              setTheKey: (secretName) => openKeyField?.(secretName),
              openHarness,
            }}
            sandboxStartCheck={sandboxStartCheck}
            announce={(text, politeness) => announce?.(text, politeness)}
          />
        ),
      }}
    >
      {drawView}
    </ItemPage>
  );
}

/** The hub's name for the breadcrumb, else its id while the hubs aren't read. */
function hubName(host: AgentsHost, hubId: string): string {
  return host.hubs().find((hub) => hub.id === hubId)?.name ?? hubId;
}
