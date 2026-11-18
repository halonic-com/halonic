import {
  Button,
  EmptyState,
  SkeletonBar,
  type Tab,
  TabList,
  TabPanel,
  usePresentation,
  useTabIds,
} from "@halonicjs/studio-kit";
import { ItemGone, type ItemViewProps } from "@halonicjs/studio-shell";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type AgentChange,
  type AgentRef,
  type AgentSettings,
  type AgentsHost,
  AgentsHostService,
} from "../api.ts";
import { Configuration } from "../configuration/configuration.tsx";
import { configurationWords } from "../configuration/configuration-words.ts";
import { Avatar } from "../list/agent-rows.tsx";
import { pageWords } from "./page-words.ts";
import { RenameField } from "./rename-field.tsx";
import { useLoad } from "./use-load.ts";

/** The agent's page in its tab: `item` names the agent, the host reads its row. */
export function AgentPage({ item, context }: ItemViewProps) {
  const { openPlace } = context;
  return (
    <AgentScreen
      host={context.services.get(AgentsHostService)}
      hubId={item.hub}
      id={item.id}
      {...(openPlace && { goToAgents: () => openPlace("agents") })}
    />
  );
}

export interface AgentScreenProps extends AgentRef {
  readonly host: AgentsHost;
  /** Leaves an agent that is gone for the Agents list; absent where the shell can't open a place. */
  readonly goToAgents?: (() => void) | undefined;
}

/**
 * The agent page's frame (`agents.page.frame`): the letter avatar, "AGENT" and the name, then the
 * agent's Runs. The page is a skeleton when the read takes over 300 ms, and says why when the
 * agent can't be read. Flow, Configuration and the Try it chat join it in the next pull requests.
 */
export function AgentScreen({ host, hubId, id, goToAgents }: AgentScreenProps) {
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
  const [view, setView] = useState<AgentView>("runs");
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
  if (load.kind === "failed" && load.gone === true && goToAgents !== undefined) {
    return <ItemGone kindName="agent" place="Agents" onGoTo={goToAgents} />;
  }
  const name = load.kind === "ready" ? load.value.name : id;
  return (
    <div className="flex size-full min-h-0 flex-col">
      <header
        className={
          phone
            ? "flex flex-col gap-3 border-b border-border px-4 py-3"
            : "flex items-center gap-3 border-b border-border px-6 py-3"
        }
      >
        <Avatar name={name} />
        <div className="flex flex-col">
          <p className="text-caption text-fg-muted">{pageWords.kind}</p>
          {/* On a phone the top bar already names the agent, so the page keeps only its type. */}
          <h1 ref={title} tabIndex={-1} className="sr-only">
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
        {view === "configuration" ? (
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
        ) : (
          <div className="min-w-0 flex-1 overflow-auto p-6">
            {load.kind === "ready" && (
              <section aria-label={pageWords.runsHeading} className="flex flex-col gap-2">
                <h2 className="text-caption text-fg-muted">{pageWords.runsHeading}</h2>
                <p className="text-small text-fg-muted">{pageWords.noRuns}</p>
              </section>
            )}
            {load.kind === "failed" && (
              <EmptyState
                tone="error"
                title={pageWords.loadFailedTitle}
                description={load.reason}
                action={{ label: pageWords.tryAgain, onClick: retry, busy: load.retrying }}
              />
            )}
            {load.kind === "loading" && load.skeleton && (
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
            )}
          </div>
        )}
      </TabPanel>
    </div>
  );
}

type AgentView = "configuration" | "runs";

/** The page's views, as far as they are built: Flow and the Try it chat join them later. */
const agentTabs: readonly Tab<AgentView>[] = [
  { id: "runs", label: pageWords.runsHeading },
  { id: "configuration", label: configurationWords.tab },
];
