import type { SandboxStartCheck } from "@halonicjs/app";
import { type ReactNode, useMemo } from "react";
import type { AgentRef, AgentSettings, AgentsHost } from "../api.ts";
import { harnessStrip } from "../configuration/harness-strip.ts";
import { useHarnessCheck } from "../configuration/use-harness-check.ts";
import type { Load } from "../page/use-load.ts";
import type { BoxLineActions } from "./box-line.tsx";
import { TryItChangesLine, type WatchTryItChanges } from "./try-it-changes-line.tsx";
import { TryItChatView } from "./try-it-chat.tsx";
import { useBudgetReached } from "./use-budget-reached.ts";
import { useModelKey } from "./use-model-key.ts";
import { useTryItChat } from "./use-try-it-chat.ts";

/** The props of {@link TryItPanel}. */
export interface TryItPanelProps {
  readonly host: AgentsHost;
  readonly agent: AgentRef;
  /**
   * The agent's settings as the page reads them. In v0.1 a Try it chat isn't kept, so it has
   * nothing of its own to load: its first load is the agent's.
   */
  readonly settings: Load<AgentSettings>;
  /**
   * What shows until the settings are read: nothing where the panel beside the chat already shows
   * the agent's read, else that same state, so the page never shows it twice.
   */
  readonly waiting: ReactNode;
  readonly ways: Pick<
    BoxLineActions,
    "goToKeyField" | "openHarness" | "setTheKey" | "changeBudget"
  >;
  readonly sandboxStartCheck?: SandboxStartCheck | undefined;
  /** Reads a sentence out through the shell's announcer. */
  readonly announce: (text: string, politeness?: "polite" | "assertive") => void;
}

/**
 * The Try it chat where the agent page shows it: the agent page's own state while the agent is
 * first read (`agents.chat.first-load`), then the chat. The page's header and the panel keep
 * working meanwhile, since they don't wait on the chat.
 */
export function TryItPanel({ settings, waiting, ...props }: TryItPanelProps) {
  if (settings.kind !== "ready") return waiting;
  return <ReadyChat {...props} settings={settings.value} />;
}

/** The chat once the agent is read, with what its harness check found. */
function ReadyChat({
  host,
  agent,
  settings,
  ways,
  sandboxStartCheck,
  announce,
}: Omit<TryItPanelProps, "settings" | "waiting"> & { readonly settings: AgentSettings }) {
  const chat = useTryItChat({ host, agent, name: settings.name, announce });
  const { found } = useHarnessCheck(host, agent.hubId, agent.id);
  const watchChanges = useWatchTryItChanges(host, agent);
  const modelKey = useModelKey(host, agent);
  const budgetReached = useBudgetReached(host);
  return (
    <div className="flex size-full min-h-0 flex-col">
      <div className="mx-auto w-full max-w-reading px-4 pt-3 empty:hidden">
        <TryItChangesLine watch={watchChanges} />
      </div>
      <div className="min-h-0 flex-1">
        <TryItChatView
          chat={chat}
          name={settings.name}
          description={settings.description}
          harness={settings.harness}
          harnessStrip={harnessStrip(settings.harness, found[settings.harness])}
          ways={ways}
          modelKey={modelKey}
          budgetReached={budgetReached}
          sandboxStartCheck={sandboxStartCheck}
          announce={announce}
          chatUi={settings.chatUi}
        />
      </div>
    </div>
  );
}

/**
 * The host's watch of this agent's changes to review, kept the same while the agent is, so the
 * line doesn't start watching again on every render.
 */
function useWatchTryItChanges(host: AgentsHost, agent: AgentRef): WatchTryItChanges | undefined {
  const { hubId, id } = agent;
  return useMemo(() => {
    if (host.watchTryItChanges === undefined) return undefined;
    return (listener) => host.watchTryItChanges?.({ hubId, id }, listener) ?? (() => {});
  }, [host, hubId, id]);
}
