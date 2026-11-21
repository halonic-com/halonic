import { inlineLinkClasses, usePresentation, useToastStore } from "@halonicjs/studio-kit";
import { errorReasonFor } from "@halonicjs/studio-shell";
import { useEffect, useMemo, useRef } from "react";
import type { AgentLiveState, AgentRef, AgentsHost } from "../api.ts";
import { pageWords } from "./page-words.ts";
import { useLoad } from "./use-load.ts";

/** Props for {@link NotLiveLine}. */
export interface NotLiveLineProps {
  readonly host: AgentsHost;
  readonly agent: AgentRef;
  /** The agent's name, for the toast when it can't be made live. */
  readonly name: string;
  /**
   * Called once the line goes after **Review and make live** made a version, so the page can give
   * the focus the link had to the agent's name.
   */
  readonly onMadeLive?: () => void;
}

/**
 * The quiet line under the agent page's header (`agents.page.not-live-line`, flow-agents 3.1):
 * "Changes not live yet", only while the agent has saved changes that aren't in a version, which
 * is also the case for an agent no version has yet. It is read again when a file changes. Where
 * the host can't tell, or the read fails, there is no line: the page doesn't guess.
 * Where the host can make the agent live, the line ends in **Review and make live**
 * (`agents.page.review-and-make-live`, flow-agents 3.3), which opens Create version with only this
 * agent and reads the line again once a version is made, since a version changes no file. When
 * the line then goes, `onMadeLive` moves the focus the link had. On a phone the link sits at the
 * right of the line, and under the words when both don't fit (HAL-552 5.9).
 */
export function NotLiveLine({ host, agent, name, onMadeLive }: NotLiveLineProps) {
  const phone = usePresentation() === "phone";
  const toasts = useToastStore();
  const { hubId, id } = agent;
  const source = useMemo(
    () => ({
      fetch: async (): Promise<AgentLiveState> =>
        host.liveState === undefined ? "live" : host.liveState({ hubId, id }),
      subscribe: (onChange: () => void) => host.subscribe(onChange),
    }),
    [host, hubId, id],
  );
  // A version changes no file, so nothing tells the line to read again: it does once one is made.
  const { load, retry: readAgain } = useLoad<AgentLiveState>(source);
  // Set when Review and make live made a version, until the line has gone.
  const madeLive = useRef(false);
  const live = load.kind === "ready" && load.value === "live";
  useEffect(() => {
    if (!live || !madeLive.current) return;
    madeLive.current = false;
    onMadeLive?.();
  }, [live, onMadeLive]);
  if (load.kind !== "ready" || live) return null;

  async function reviewAndMakeLive() {
    try {
      if ((await host.makeLive?.({ hubId, id })) !== "made") return;
      madeLive.current = true;
      readAgain();
    } catch (error) {
      toasts?.show({
        tone: "danger",
        title: pageWords.couldntMakeLive(name),
        text: errorReasonFor(error),
      });
    }
  }

  return (
    <p
      className={`border-b border-border py-2 text-small text-fg-muted ${phone ? "flex flex-wrap items-center justify-between gap-x-4 px-4" : "px-6"}`}
    >
      {pageWords.changesNotLive}
      {host.makeLive !== undefined && (
        <>
          {" "}
          <button
            type="button"
            className={inlineLinkClasses}
            onClick={() => void reviewAndMakeLive()}
          >
            {pageWords.reviewAndMakeLive}
          </button>
        </>
      )}
    </p>
  );
}
