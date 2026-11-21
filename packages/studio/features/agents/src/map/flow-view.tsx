import { EmptyState, SkeletonBar } from "@halonicjs/studio-kit";
import { useMemo } from "react";
import type { AgentRef, AgentsHost } from "../api.ts";
import { pageWords } from "../page/page-words.ts";
import { useLoad } from "../page/use-load.ts";
import { deleteWords } from "../trash/delete-words.ts";
import { AgentMap, type AgentMapProps } from "./agent-map.tsx";
import { mapWords as words } from "./map-words.ts";

/** Props for {@link FlowView}: the map's actions, and where its parts are read. */
export interface FlowViewProps
  extends Omit<AgentMapProps, "settings" | "team" | "tools" | "users"> {
  readonly host: AgentsHost;
  readonly agent: AgentRef;
  /** The agent's name, for the loading label and the failure's title. */
  readonly name: string;
  /** Opens the agent's file, for **Open as file** when the map can't be drawn; absent where the app can't. */
  readonly openAsFile?: (() => void) | undefined;
}

/**
 * The page's Flow view: reads what the map shows (the agent's settings, its hub's agents and tools,
 * and the workflows that run it), again when a file changes, and draws the map. While it reads it
 * shows a skeleton; when it can't, it says "Couldn't show *Sorter*'s map" with the reason and
 * **Open as file** (microcopy 8.4), or **Try again** where the file can't be opened.
 */
export function FlowView({ host, agent, name, openAsFile, ...actions }: FlowViewProps) {
  const { hubId, id } = agent;
  const source = useMemo(
    () => ({
      fetch: async () => {
        const [settings, team, tools, users] = await Promise.all([
          host.settings({ hubId, id }),
          host.team({ hubId, id }),
          host.toolOptions({ hubId, id }),
          host.referencesTo({ hubId, id }),
        ]);
        return { settings, team, tools, users };
      },
      subscribe: (onChange: () => void) => host.subscribe(onChange),
    }),
    [host, hubId, id],
  );
  const { load, retry } = useLoad(source);
  if (load.kind === "failed") {
    return (
      <EmptyState
        tone="error"
        title={words.loadFailed(name)}
        description={load.reason}
        action={
          openAsFile === undefined
            ? { label: words.tryAgain, onClick: retry, busy: load.retrying }
            : { label: deleteWords.openAsFile, onClick: openAsFile }
        }
      />
    );
  }
  if (load.kind === "loading") {
    return load.skeleton ? (
      <div role="status" className="flex flex-col gap-4 p-6">
        <span className="sr-only">{pageWords.loading(name)}</span>
        <SkeletonBar kind="value" />
        <SkeletonBar kind="value" />
      </div>
    ) : null;
  }
  return <AgentMap {...load.value} {...actions} />;
}
