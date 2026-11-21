import { type SandboxStartCheck, sandboxStartCheckKey } from "@halonicjs/app";
import { LetterTile, type Tab, usePresentation } from "@halonicjs/studio-kit";
import {
  type CardStack,
  type CloseStack,
  createCloseStack,
  dropGoneCards,
  ItemGone,
  ItemPage,
  type ItemPageSectionListing,
  type ItemViewProps,
  noCards,
  openCard,
  type SaveState,
  type SectionsProps,
  StackedCards,
} from "@halonicjs/studio-shell";
import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type AgentChange,
  type AgentListing,
  type AgentRef,
  type AgentStep,
  type AgentsHost,
  AgentsHostService,
  type AgentToolList,
  type AgentUser,
} from "../api.ts";
import { TryItPanel } from "../chat/try-it-panel.tsx";
import { Configuration, type ConfigurationPage } from "../configuration/configuration.tsx";
import { configurationWords } from "../configuration/configuration-words.ts";
import { useConfigurationLoads } from "../configuration/use-configuration-loads.ts";
import { fileItemOf } from "../trash/file-item.ts";
import { useAgentTrash } from "../trash/use-agent-trash.tsx";
import { AgentPhoneFrame } from "./agent-phone-frame.tsx";
import { AgentStepCard, agentStepCardKey, agentStepOfCard } from "./agent-step-card.tsx";
import { AgentRead, AgentRuns } from "./agent-views.tsx";
import { forgetFreshAgent, isFreshAgent } from "./fresh-agents.ts";
import { nameProblem } from "./name-check.ts";
import { NotLiveLine } from "./not-live-line.tsx";
import { pageWords } from "./page-words.ts";
import { SubagentCard, subagentCardKey, subagentOfCard } from "./subagent-card.tsx";
import { useLoad } from "./use-load.ts";

/**
 * The Library's commands that open it on a tab (`library.skill` and so on); the Agents feature
 * can't import the Library, so it runs them by id.
 */
const libraryTabCommands: Readonly<Record<AgentToolList, string>> = {
  skills: "library.skill",
  knowledge: "library.knowledge",
  connectors: "library.connector",
};

/**
 * The Workspace feature's command that opens Workspace settings, where the Models feature keeps
 * the providers and their keys; run by id, as the Agents feature can't import it.
 */
const openWorkspaceCommand = "workspace.open";

/** The agent's page in its tab: `item` names the agent, the host reads its row. */
export function AgentPage({ item, context, Sections, sections }: ItemViewProps) {
  const { openPlace, openItem, runCommand, closeStack, announcer } = context;
  const announce = useCallback(
    (text: string, politeness?: "polite" | "assertive") => announcer.announce(text, politeness),
    [announcer],
  );
  return (
    <AgentScreen
      host={context.services.get(AgentsHostService)}
      saving={context.saving}
      hubId={item.hub}
      id={item.id}
      sections={sections}
      Sections={Sections}
      {...(openPlace && {
        goToAgents: () => openPlace("agents"),
        openRuns: () => openPlace("runs"),
      })}
      {...(openItem && { openFile: (path: string) => openItem(fileItemOf(path)) })}
      {...(runCommand && {
        openLibrary: (list: AgentToolList) => runCommand(libraryTabCommands[list]),
        openKeyField: () => runCommand(openWorkspaceCommand),
      })}
      closeStack={closeStack}
      announce={announce}
      sandboxStartCheck={context.services.find(sandboxStartCheckKey)}
      {...(openItem && {
        openAgent: (agent: AgentRef) => openItem({ kind: "agent", hub: agent.hubId, id: agent.id }),
      })}
    />
  );
}

export interface AgentScreenProps extends AgentRef {
  readonly host: AgentsHost;
  /** The window's save state, for the toolbar's "1 field not saved"; absent without a window. */
  readonly saving?: Pick<SaveState, "setFieldsNotSaved"> | undefined;
  /** Leaves an agent that is gone for the Agents list; absent where the shell can't open a place. */
  readonly goToAgents?: (() => void) | undefined;
  /** Opens a workspace file in a tab, for **Open as file**; absent where the app can't, which leaves it out of the menu. */
  readonly openFile?: ((path: string) => void) | undefined;
  /** Opens Library on a Tools list's tab, for **Open Library ›**; absent where the app can't. */
  readonly openLibrary?: ((list: AgentToolList) => void) | undefined;
  /** Opens the Runs page, for **Open the Runs page ›**; absent where the app can't open a place. */
  readonly openRuns?: (() => void) | undefined;
  /** Opens where keys are kept, for the Try it chat's **Go to the key field ›**. */
  readonly openKeyField?: (() => void) | undefined;
  /** The window's close stack, so Esc closes the top card; a page of its own without one. */
  readonly closeStack?: CloseStack | undefined;
  /** Reads a sentence to screen readers, such as "*Writer* was removed." when its card drops. */
  readonly announce?: ((text: string, politeness?: "polite" | "assertive") => void) | undefined;
  /** Opens another agent's page, from a card's team chart; absent where the app can't. */
  readonly openAgent?: ((agent: AgentRef) => void) | undefined;
  /** The sections other features add to the page, such as Triggers; Configuration lists them as pages. */
  readonly sections?: readonly ItemPageSectionListing[] | undefined;
  /** The shell's component that draws them; absent where there's no window. */
  readonly Sections?: ComponentType<SectionsProps> | undefined;
  /** Checks that the sandbox can start a program, for the Try it chat of an agent that starts one. */
  readonly sandboxStartCheck?: SandboxStartCheck | undefined;
}

/**
 * The agent page (`agents.page.frame`): the shell's item page, with "AGENT" and the agent's name in
 * its header, the Try it chat on the left (`agents.chat.first-load`, flow-agents 3.1) and the
 * agent's Configuration, or its Runs, in the panel beside it. On a phone the views fill the page
 * under the letter avatar. The panel is a skeleton when the read takes over 300 ms, and says why
 * when the agent can't be read.
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
  sections,
  Sections,
  sandboxStartCheck,
}: AgentScreenProps) {
  // After a Try again reads, the agent's name takes the focus the button had.
  const title = useRef<HTMLHeadingElement>(null);
  const source = useMemo(
    () => ({
      fetch: () => host.read({ hubId, id }),
      subscribe: (onChange: () => void) => host.subscribe(onChange),
    }),
    [host, hubId, id],
  );
  const phone = usePresentation() === "phone";
  const { load, retry } = useLoad(source, () => title.current?.focus());
  const { settings, aliases, defaultModel } = useConfigurationLoads(host, { hubId, id });
  const takenNames = useTakenNames(host, { hubId, id });
  // The workflows that run the agent, for what the Runs tab says; read again when a file changes.
  const usersSource = useMemo(
    () => ({
      fetch: () => host.referencesTo({ hubId, id }),
      subscribe: (onChange: () => void) => host.subscribe(onChange),
    }),
    [host, hubId, id],
  );
  const users = useLoad<readonly AgentUser[]>(usersSource);
  const { view, selectView, fresh } = useAgentView(hubId, id);
  const [configurationPage, setConfigurationPage] = useState<ConfigurationPage>("behaviour");
  const cards = useAgentCards(host, { hubId, id }, announce);
  // Picking another view closes the stack: cards belong to the view they opened over (flow-agents 7).
  const showView = (next: AgentView) => {
    if (next !== view) cards.close();
    selectView(next);
  };
  const ownCloseStack = useMemo(() => createCloseStack(), []);
  const [saveFailed, setSaveFailed] = useState<string>();
  // Resolves to whether the change was written, so a page can put its control back when it wasn't.
  const save = async (change: AgentChange): Promise<boolean> => {
    try {
      await host.update({ hubId, id }, change);
      setSaveFailed(undefined);
      return true;
    } catch (error) {
      setSaveFailed(error instanceof Error ? error.message : pageWords.saveFailed);
      return false;
    }
  };
  const name = load.kind === "ready" ? load.value.name : id;
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
      {ready && <NotLiveLine host={host} agent={{ hubId, id }} />}
      {saveFailed !== undefined && (
        <p role="alert" className="border-b border-border px-6 py-2 text-small text-danger">
          {pageWords.couldntSave(saveFailed)}
        </p>
      )}
    </>
  );
  // Until the agent is read, its read speaks for the page whichever view is open.
  const drawView = (shown: AgentView): ReactNode => {
    if (!ready) {
      return (
        <div className="min-w-0 flex-1 overflow-auto p-6">
          <AgentRead load={load} name={name} retry={retry} />
        </div>
      );
    }
    if (shown === "runs") {
      return (
        <div className="min-w-0 flex-1 overflow-auto p-6">
          <AgentRuns name={name} users={users.load} openRuns={openRuns} />
        </div>
      );
    }
    return (
      <StackedCards
        itemPath={[hubName(host, hubId), name]}
        stack={cards.stack}
        onChange={cards.set}
        closeStack={closeStack ?? ownCloseStack}
        // No card on this page docks, so the panel's width doesn't change how they look.
        panelWidth={Number.POSITIVE_INFINITY}
        renderCard={(card) => {
          const step = agentStepOfCard(card.key);
          if (step !== undefined) {
            const agentSettings = settings.load.kind === "ready" ? settings.load.value : undefined;
            const found = agentSettings?.agentSteps.find((each) => each.id === step);
            return found === undefined || agentSettings === undefined ? null : (
              <AgentStepCard step={found} agent={agentSettings} />
            );
          }
          const subagent = subagentOfCard(card.key);
          return subagent === undefined ? null : (
            <SubagentCard
              host={host}
              agent={{ hubId, id: subagent }}
              name={card.title}
              openSubagent={cards.openSubagent}
              openAgent={openAgent}
              announce={announce}
            />
          );
        }}
      >
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
          page={configurationPage}
          onPickPage={setConfigurationPage}
        />
      </StackedCards>
    );
  };

  if (phone) {
    return (
      <AgentPhoneFrame
        name={name}
        titleRef={titleRef}
        menu={ready && trash.menu}
        views={agentTabs}
        view={view}
        onPickView={showView}
        notice={notice}
      >
        {drawView(view)}
      </AgentPhoneFrame>
    );
  }
  return (
    <ItemPage<AgentView>
      icon={<LetterTile name={name} />}
      kind={pageWords.kindWord}
      name={name}
      // Until the agent is read there's no name to change.
      onRename={(next) => {
        if (ready) void save({ name: next });
      }}
      check={(next) => nameProblem(next, takenNames)}
      titleRef={titleRef}
      actions={ready ? trash.actions : []}
      views={agentTabs}
      view={view}
      onPickView={showView}
      notice={notice}
      closeStack={closeStack}
      chat={{
        startsOpen: true,
        render: () => (
          <TryItPanel
            host={host}
            agent={{ hubId, id }}
            settings={settings.load}
            retry={settings.retry}
            ways={{
              goToKeyField: () => openKeyField?.(),
              openHarness: () => {
                showView("configuration");
                setConfigurationPage("harness");
              },
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

/** The names of the hub's other agents, for the rename check; read again when a file changes. */
function useTakenNames(host: AgentsHost, { hubId, id }: AgentRef): readonly string[] {
  const [takenNames, setTakenNames] = useState<readonly string[]>([]);
  useEffect(() => {
    const read = () =>
      host
        .list()
        .then((agents) =>
          setTakenNames(
            agents
              .filter((agent) => agent.hubId === hubId && agent.id !== id)
              .map((agent) => agent.name),
          ),
        )
        .catch(() => setTakenNames([]));
    void read();
    return host.subscribe(() => void read());
  }, [host, hubId, id]);
  return takenNames;
}

/** The hub's name for the breadcrumb, else its id while the hubs aren't read. */
function hubName(host: AgentsHost, hubId: string): string {
  return host.hubs().find((hub) => hub.id === hubId)?.name ?? hubId;
}

/** The agent page's stack of cards, and the ways to change it. */
interface AgentCards {
  readonly stack: CardStack;
  readonly set: (stack: CardStack) => void;
  readonly openSubagent: (agent: AgentListing) => void;
  readonly openAgentStep: (step: AgentStep) => void;
  readonly close: () => void;
}

/**
 * The cards stacked on the agent page's panel (flow-agents 7): a subagent and an agent step open
 * as cards, and a card whose agent or agent step is gone drops with every card above it, saying
 * so to screen readers. The stack is the page's state, so it stays across tab switches while the
 * page stays mounted.
 */
function useAgentCards(
  host: AgentsHost,
  agent: AgentRef,
  announce: ((text: string) => void) | undefined,
): AgentCards {
  const [stack, setStack] = useState<CardStack>(noCards);
  const latest = useRef(stack);
  latest.current = stack;
  const set = useCallback((next: CardStack) => setStack(next), []);
  const openSubagent = useCallback(
    (sub: AgentListing) =>
      setStack((now) => openCard(now, { key: subagentCardKey(sub), title: sub.name })),
    [],
  );
  const openAgentStep = useCallback(
    (step: AgentStep) =>
      setStack((now) => openCard(now, { key: agentStepCardKey(step), title: step.id })),
    [],
  );
  const close = useCallback(() => setStack(noCards), []);
  const { hubId, id } = agent;
  useEffect(() => {
    let live = true;
    const check = async () => {
      if (latest.current.length === 0) return;
      const [team, agentSettings] = await Promise.all([
        host.team({ hubId, id }),
        host.settings({ hubId, id }),
      ]).catch(() => []);
      if (!live || team === undefined || agentSettings === undefined) return;
      const agents = new Set(team.map((member) => member.id));
      const steps = new Set(agentSettings.agentSteps.map((step) => step.id));
      const { stack: kept, removed } = dropGoneCards(latest.current, (card) => {
        const sub = subagentOfCard(card.key);
        const step = agentStepOfCard(card.key);
        return (sub === undefined || agents.has(sub)) && (step === undefined || steps.has(step));
      });
      if (removed === undefined) return;
      setStack(kept);
      announce?.(pageWords.cardRemoved(removed.title));
    };
    const stop = host.subscribe(() => void check());
    return () => {
      live = false;
      stop();
    };
  }, [host, hubId, id, announce]);
  return { stack, set, openSubagent, openAgentStep, close };
}

type AgentView = "configuration" | "runs";

/**
 * The view the page shows. Runs can't list anything in 0.1 (R9), so the page opens where the agent
 * is finished, on Configuration (HAL-12399). An agent just made with nothing written opens there
 * on Behaviour with Instructions focused (`agents.page.new-agent`); once the person picks a view,
 * it is a page like any other, so coming back to Behaviour doesn't take the focus again.
 */
function useAgentView(hubId: string, id: string) {
  const [fresh, setFresh] = useState(() => isFreshAgent(hubId, id));
  useEffect(() => forgetFreshAgent(hubId, id), [hubId, id]);
  const [view, setView] = useState<AgentView>("configuration");
  const selectView = (next: AgentView) => {
    setView(next);
    setFresh(false);
  };
  return { view, selectView, fresh };
}

/** The panel's views, as far as they are built: Flow joins them later. */
const agentTabs: readonly [Tab<AgentView>, ...Tab<AgentView>[]] = [
  { id: "runs", label: pageWords.runsHeading },
  { id: "configuration", label: configurationWords.tab },
];
