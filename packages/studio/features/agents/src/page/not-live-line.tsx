import { usePresentation } from "@halonicjs/studio-kit";
import { useMemo } from "react";
import type { AgentLiveState, AgentRef, AgentsHost } from "../api.ts";
import { pageWords } from "./page-words.ts";
import { useLoad } from "./use-load.ts";

/** Props for {@link NotLiveLine}. */
export interface NotLiveLineProps {
  readonly host: AgentsHost;
  readonly agent: AgentRef;
}

/**
 * The quiet line under the agent page's header (`agents.page.not-live-line`, flow-agents 3.1):
 * "Changes not live yet", only while the agent has saved changes that aren't in a version, which
 * is also the case for an agent no version has yet. It is read again when a file changes. Where
 * the host can't tell, or the read fails, there is no line: the page doesn't guess.
 * **Review and make live** joins it once another feature can open Create version for one item.
 */
export function NotLiveLine({ host, agent }: NotLiveLineProps) {
  const phone = usePresentation() === "phone";
  const { hubId, id } = agent;
  const source = useMemo(
    () => ({
      fetch: async (): Promise<AgentLiveState> =>
        host.liveState === undefined ? "live" : host.liveState({ hubId, id }),
      subscribe: (onChange: () => void) => host.subscribe(onChange),
    }),
    [host, hubId, id],
  );
  const { load } = useLoad<AgentLiveState>(source);
  if (load.kind !== "ready" || load.value === "live") return null;
  return (
    <p
      className={`border-b border-border py-2 text-small text-fg-muted ${phone ? "px-4" : "px-6"}`}
    >
      {pageWords.changesNotLive}
    </p>
  );
}
