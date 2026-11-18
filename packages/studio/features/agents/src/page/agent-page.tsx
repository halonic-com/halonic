import {
  Button,
  EmptyState,
  LetterTile,
  SkeletonBar,
  type Tab,
  TabList,
  TabPanel,
  usePresentation,
  useTabIds,
} from "@halonicjs/studio-kit";
import { ItemGone, type ItemViewProps } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type AgentChange,
  type AgentListing,
  type AgentRef,
  type AgentSettings,
  type AgentsHost,
  AgentsHostService,
  type AgentUser,
} from "../api.ts";
import { Configuration } from "../configuration/configuration.tsx";
import { configurationWords } from "../configuration/configuration-words.ts";
import { fileItemOf } from "../trash/file-item.ts";
import { useAgentTrash } from "../trash/use-agent-trash.tsx";
import { pageWords } from "./page-words.ts";
import { RenameField } from "./rename-field.tsx";
import { type Load, useLoad } from "./use-load.ts";

/** The agent's page in its tab: `item` names the agent, the host reads its row. */
export function AgentPage({ item, context }: ItemViewProps) {
  const { openPlace, openItem } = context;
  return (
    <AgentScreen
      host={context.services.get(AgentsHostService)}
      hubId={item.hub}
      id={item.id}
      {...(openPlace && { goToAgents: () => openPlace("agents") })}
      {...(openItem && { openFile: (path: string) => openItem(fileItemOf(path)) })}
    />
  );
}

export interface AgentScreenProps extends AgentRef {
  readonly host: AgentsHost;
  /** Leaves an agent that is gone for the Agents list; absent where the shell can't open a place. */
  readonly goToAgents?: (() => void) | undefined;
  /** Opens a workspace file in a tab, for **Open as file**; absent where the app can't, which leaves it out of the menu. */
  readonly openFile?: ((path: string) => void) | undefined;
}

/**
 * The agent page's frame (`agents.page.frame`): the letter avatar, "AGENT" and the name, then the
 * agent's Configuration, with its Runs in the other tab. The page is a skeleton when the read
 * takes over 300 ms, and says why when the agent can't be read. Flow and the Try it chat join it
 * in the next pull requests.
 */
export function AgentScreen({ host, hubId, id, goToAgents, openFile }: AgentScreenProps) {
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
  const settingsSource = useMemo(
    () => ({
      fetch: () => host.settings({ hubId, id }),
      subscribe: (onChange: () => void) => host.subscribe(onChange),
    }),
    [host, hubId, id],
  );
  const settings = useLoad<AgentSettings>(settingsSource);
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
  // The hub's model aliases for the Model page; read again when a file changes.
  const aliasesSource = useMemo(
    () => ({
      fetch: () => host.modelAliases({ hubId, id }),
      subscribe: (onChange: () => void) => host.subscribe(onChange),
    }),
    [host, hubId, id],
  );
  const aliases = useLoad<readonly string[]>(aliasesSource);
  // The model an agent without one runs on, for the Model page; read again when a file changes.
  const defaultModelSource = useMemo(
    () => ({
      fetch: () => host.defaultModel(hubId),
      subscribe: (onChange: () => void) => host.subscribe(onChange),
    }),
    [host, hubId],
  );
  const defaultModel = useLoad<string | undefined>(defaultModelSource);
  // The workflows that run the agent, for what the Runs tab says; read again when a file changes.
  const usersSource = useMemo(
    () => ({
      fetch: () => host.referencesTo({ hubId, id }),
      subscribe: (onChange: () => void) => host.subscribe(onChange),
    }),
    [host, hubId, id],
  );
  const users = useLoad<readonly AgentUser[]>(usersSource);
  // Runs can't list anything in 0.1 (R9), so the page opens where the agent is finished (HAL-12399).
  const [view, setView] = useState<AgentView>("configuration");
  const [saveFailed, setSaveFailed] = useState<string>();
  const ids = useTabIds();
  const save = async (change: AgentChange) => {
    try {
      await host.update({ hubId, id }, change);
      setSaveFailed(undefined);
    } catch (error) {
      setSaveFailed(error instanceof Error ? error.message : pageWords.saveFailed);
    }
  };
  const name = load.kind === "ready" ? load.value.name : id;
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
          onSelect={setView}
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
          <Configuration
            host={host}
            name={name}
            load={settings.load}
            aliases={aliases.load}
            defaultModel={defaultModel.load.kind === "ready" ? defaultModel.load.value : undefined}
            retryAliases={aliases.retry}
            retry={settings.retry}
            save={save}
          />
        )}
        {panel === "runs" && (
          <div className="min-w-0 flex-1 overflow-auto p-6">
            <section aria-label={pageWords.runsHeading} className="flex flex-col gap-2">
              <h2 className="text-caption text-fg-muted">{pageWords.runsHeading}</h2>
              {runsLines(name, users.load).map((line) => (
                <p key={line} className="text-small text-fg-muted">
                  {line}
                </p>
              ))}
            </section>
          </div>
        )}
      </TabPanel>
    </div>
  );
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

/** The page's views, as far as they are built: Flow and the Try it chat join them later. */
const agentTabs: readonly Tab<AgentView>[] = [
  { id: "runs", label: pageWords.runsHeading },
  { id: "configuration", label: configurationWords.tab },
];
