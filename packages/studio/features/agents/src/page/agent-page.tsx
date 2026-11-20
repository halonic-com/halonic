import {
  Button,
  EmptyState,
  inlineLinkClasses,
  LetterTile,
  SkeletonBar,
  type Tab,
  TabList,
  TabPanel,
  usePresentation,
  useTabIds,
} from "@halonicjs/studio-kit";
import {
  type CardStack,
  type CloseStack,
  createCloseStack,
  dropGoneCards,
  ItemGone,
  type ItemViewProps,
  noCards,
  openCard,
  type SaveState,
  StackedCards,
} from "@halonicjs/studio-shell";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type AgentChange,
  type AgentListing,
  type AgentRef,
  type AgentsHost,
  AgentsHostService,
  type AgentToolList,
  type AgentUser,
} from "../api.ts";
import { Configuration } from "../configuration/configuration.tsx";
import { configurationWords } from "../configuration/configuration-words.ts";
import { useConfigurationLoads } from "../configuration/use-configuration-loads.ts";
import { fileItemOf } from "../trash/file-item.ts";
import { useAgentTrash } from "../trash/use-agent-trash.tsx";
import { forgetFreshAgent, isFreshAgent } from "./fresh-agents.ts";
import { pageWords } from "./page-words.ts";
import { RenameField } from "./rename-field.tsx";
import { SubagentCard, subagentCardKey, subagentOfCard } from "./subagent-card.tsx";
import { type Load, useLoad } from "./use-load.ts";

/**
 * The Library's commands that open it on a tab (`library.skill` and so on); the Agents feature
 * can't import the Library, so it runs them by id.
 */
const libraryTabCommands: Readonly<Record<AgentToolList, string>> = {
  skills: "library.skill",
  knowledge: "library.knowledge",
  connectors: "library.connector",
};

/** The agent's page in its tab: `item` names the agent, the host reads its row. */
export function AgentPage({ item, context }: ItemViewProps) {
  const { openPlace, openItem, runCommand, closeStack, announcer } = context;
  const announce = useCallback((text: string) => announcer.announce(text), [announcer]);
  return (
    <AgentScreen
      host={context.services.get(AgentsHostService)}
      saving={context.saving}
      hubId={item.hub}
      id={item.id}
      {...(openPlace && {
        goToAgents: () => openPlace("agents"),
        openRuns: () => openPlace("runs"),
      })}
      {...(openItem && { openFile: (path: string) => openItem(fileItemOf(path)) })}
      {...(runCommand && {
        openLibrary: (list: AgentToolList) => runCommand(libraryTabCommands[list]),
      })}
      closeStack={closeStack}
      announce={announce}
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
  /** The window's close stack, so Esc closes the top card; a page of its own without one. */
  readonly closeStack?: CloseStack | undefined;
  /** Reads a sentence to screen readers, such as "*Writer* was removed." when its card drops. */
  readonly announce?: ((text: string) => void) | undefined;
  /** Opens another agent's page, from a card's team chart; absent where the app can't. */
  readonly openAgent?: ((agent: AgentRef) => void) | undefined;
}

/**
 * The agent page's frame (`agents.page.frame`): the letter avatar, "AGENT" and the name, then the
 * agent's Configuration, with its Runs in the other tab. The page is a skeleton when the read
 * takes over 300 ms, and says why when the agent can't be read. Flow and the Try it chat join it
 * in the next pull requests.
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
  closeStack,
  announce,
  openAgent,
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
  const [takenNames, setTakenNames] = useState<readonly string[]>([]);
  // The other agents' names, for the rename check; read again when a file changes.
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
  const cards = useAgentCards(host, { hubId, id }, announce);
  // Picking another view closes the stack: cards belong to the view they opened over (flow-agents 7).
  const showView = (next: AgentView) => {
    if (next !== view) cards.close();
    selectView(next);
  };
  const ownCloseStack = useMemo(() => createCloseStack(), []);
  const [saveFailed, setSaveFailed] = useState<string>();
  const ids = useTabIds();
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
  // Until the agent is read, its read speaks for the page whichever view is open.
  const panel: AgentView | "read" = load.kind === "ready" ? view : "read";
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
  return (
    <div className="flex size-full min-h-0 flex-col">
      <header
        className={
          phone
            ? "flex flex-col gap-3 border-b border-border px-4 py-3"
            : "flex items-center gap-3 border-b border-border px-6 py-3"
        }
      >
        <div className="flex min-w-0 items-center gap-3">
          <LetterTile name={name} />
          <div className="flex flex-col">
            <p className="text-caption text-fg-muted">{pageWords.kind}</p>
            {/* On a phone the top bar already names the agent, so the page keeps only its type. */}
            <h1 ref={titleRef} tabIndex={-1} className="sr-only">
              {name}
            </h1>
            {!phone && load.kind === "ready" && (
              <RenameField
                name={name}
                takenNames={takenNames}
                onRename={(next) => void save({ name: next })}
              />
            )}
          </div>
          {load.kind === "ready" && trash.menu}
        </div>
        <TabList
          label={pageWords.views}
          tabs={agentTabs}
          selected={view}
          onSelect={showView}
          ids={ids}
        />
      </header>
      {saveFailed !== undefined && (
        <p role="alert" className="border-b border-border px-6 py-2 text-small text-danger">
          {pageWords.couldntSave(saveFailed)}
        </p>
      )}
      <TabPanel ids={ids} tabs={agentTabs} selected={view} className="flex min-h-0 flex-1 flex-col">
        {panel === "read" && (
          <div className="min-w-0 flex-1 overflow-auto p-6">
            <AgentRead load={load} name={name} retry={retry} />
          </div>
        )}
        {panel === "configuration" && (
          <StackedCards
            itemPath={[hubName(host, hubId), name]}
            stack={cards.stack}
            onChange={cards.set}
            closeStack={closeStack ?? ownCloseStack}
            // No card on this page docks, so the panel's width doesn't change how they look.
            panelWidth={Number.POSITIVE_INFINITY}
            renderCard={(card) => {
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
            />
          </StackedCards>
        )}
        {panel === "runs" && (
          <div className="min-w-0 flex-1 overflow-auto p-6">
            <section aria-label={pageWords.runsHeading} className="flex flex-col gap-2">
              <h2 className="text-caption text-fg-muted">{pageWords.runsHeading}</h2>
              {runsLines(name, users.load).map((line) => (
                <p key={line} className="text-small text-fg-muted">
                  {line}
                  {line === pageWords.noRuns && openRuns && (
                    <>
                      {" "}
                      <button type="button" className={inlineLinkClasses} onClick={openRuns}>
                        {pageWords.openRuns}
                      </button>
                    </>
                  )}
                </p>
              ))}
            </section>
          </div>
        )}
      </TabPanel>
    </div>
  );
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
  readonly close: () => void;
}

/**
 * The cards stacked on the agent page's panel (flow-agents 7): a subagent opens as a card, and a
 * card whose agent is gone drops with every card above it, saying so to screen readers. The stack
 * is the page's state, so it stays across tab switches while the page stays mounted.
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
  const close = useCallback(() => setStack(noCards), []);
  const { hubId, id } = agent;
  useEffect(() => {
    let live = true;
    const check = async () => {
      if (latest.current.length === 0) return;
      const team = await host.team({ hubId, id }).catch(() => undefined);
      if (!live || team === undefined) return;
      const ids = new Set(team.map((member) => member.id));
      const { stack: kept, removed } = dropGoneCards(latest.current, (card) => {
        const sub = subagentOfCard(card.key);
        return sub === undefined || ids.has(sub);
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
  return { stack, set, openSubagent, close };
}

/**
 * The agent while it is read, whichever view is open: a skeleton after 300 ms, then "Still
 * loading" with **Try again**, or why it couldn't be read.
 */
function AgentRead({
  load,
  name,
  retry,
}: {
  readonly load: Load<AgentListing>;
  readonly name: string;
  readonly retry: () => void;
}) {
  if (load.kind === "failed") {
    return (
      <EmptyState
        tone="error"
        title={pageWords.loadFailedTitle}
        description={load.reason}
        action={{ label: pageWords.tryAgain, onClick: retry, busy: load.retrying }}
      />
    );
  }
  if (load.kind === "ready" || !load.skeleton) return null;
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">{pageWords.loading(name)}</span>
      <SkeletonBar kind="value" />
      <SkeletonBar kind="value" />
      {load.slow && (
        <p className="flex items-center gap-3 text-small text-fg-muted">
          {pageWords.stillLoading}
          <Button variant="secondary" size="sm" onClick={retry}>
            {pageWords.tryAgain}
          </Button>
        </p>
      )}
    </div>
  );
}

/**
 * What the Runs tab says. A run doesn't say which agent ran in it (R9), so the tab lists none: an
 * agent no workflow runs can't have run, and one that workflows run is pointed to their runs. While
 * the workflows are read it says nothing, and when they can't be read it doesn't guess.
 */
function runsLines(name: string, users: Load<readonly AgentUser[]>): readonly string[] {
  if (users.kind === "loading") return [];
  if (users.kind === "failed") return [pageWords.runsAsAStep(name)];
  if (users.value.length === 0) return [pageWords.noRuns, pageWords.runsInAWorkflow(name)];
  return [
    pageWords.runsInWorkflows(
      name,
      users.value.map((user) => user.name),
    ),
  ];
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

/** The page's views, as far as they are built: Flow and the Try it chat join them later. */
const agentTabs: readonly Tab<AgentView>[] = [
  { id: "runs", label: pageWords.runsHeading },
  { id: "configuration", label: configurationWords.tab },
];
