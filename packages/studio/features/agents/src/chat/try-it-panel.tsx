import type { SandboxStartCheck } from "@halonicjs/app";
import { ChatLoading, EmptyState } from "@halonicjs/studio-kit";
import type { AgentRef, AgentSettings, AgentsHost } from "../api.ts";
import { harnessStrip } from "../configuration/harness-strip.ts";
import { useHarnessCheck } from "../configuration/use-harness-check.ts";
import type { Load } from "../page/use-load.ts";
import type { BoxLineActions } from "./box-line.tsx";
import { TryItChatView } from "./try-it-chat.tsx";
import { tryItWords } from "./try-it-words.ts";
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
  /** Reads the settings again, for **Try again**. */
  readonly retry: () => void;
  readonly ways: Pick<BoxLineActions, "goToKeyField" | "openHarness">;
  readonly sandboxStartCheck?: SandboxStartCheck | undefined;
  /** Reads a sentence out through the shell's announcer. */
  readonly announce: (text: string, politeness?: "polite" | "assertive") => void;
}

/**
 * The Try it chat where the agent page shows it: while the agent is first read, the chat's
 * skeleton lines (H7); when it can't be read, why, with **Try again** (H11); then the chat. The
 * page's header and the panel keep working in both, since they don't wait on the chat.
 */
export function TryItPanel({ settings, retry, ...props }: TryItPanelProps) {
  switch (settings.kind) {
    case "loading":
      return <ChatLoading label={tryItWords.loading} onRetry={retry} />;
    case "failed":
      return (
        <div className="mx-auto w-full max-w-reading p-4">
          <EmptyState
            tone="error"
            title={tryItWords.couldntLoad}
            description={settings.reason}
            action={{ label: tryItWords.tryAgain, onClick: retry, busy: settings.retrying }}
          />
        </div>
      );
    case "ready":
      return <ReadyChat {...props} settings={settings.value} />;
  }
}

/** The chat once the agent is read, with what its harness check found. */
function ReadyChat({
  host,
  agent,
  settings,
  ways,
  sandboxStartCheck,
  announce,
}: Omit<TryItPanelProps, "settings" | "retry"> & { readonly settings: AgentSettings }) {
  const chat = useTryItChat({ host, agent, name: settings.name, announce });
  const { found } = useHarnessCheck(host, agent.hubId, agent.id);
  return (
    <TryItChatView
      chat={chat}
      name={settings.name}
      description={settings.description}
      harness={settings.harness}
      harnessStrip={harnessStrip(settings.harness, found[settings.harness])}
      ways={ways}
      sandboxStartCheck={sandboxStartCheck}
      announce={announce}
    />
  );
}
