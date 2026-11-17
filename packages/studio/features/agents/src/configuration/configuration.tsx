import { EmptyState, SkeletonBar } from "@halonicjs/studio-kit";
import type { AgentChange, AgentSettings } from "../api.ts";
import type { Load } from "../page/use-load.ts";
import { BehaviourPage } from "./behaviour-page.tsx";
import { configurationWords as words } from "./configuration-words.ts";

/** Props for {@link Configuration}. */
export interface ConfigurationProps {
  readonly name: string;
  readonly load: Load<AgentSettings>;
  readonly retry: () => void;
  readonly save: (change: AgentChange) => Promise<void>;
}

/**
 * The agent's Configuration (`agents.configuration.pages`): a list of pages on the left and the
 * picked page beside it. Only Behaviour is built; a page that isn't built is absent, not empty
 * (flow-agents 5.1).
 */
export function Configuration({ name, load, retry, save }: ConfigurationProps) {
  if (load.kind === "failed") {
    return (
      <EmptyState
        tone="error"
        title={words.loadFailedTitle(name)}
        description={load.reason}
        action={{ label: words.tryAgain, onClick: retry, busy: load.retrying }}
      />
    );
  }
  return (
    <div className="flex min-h-0 flex-1">
      <div
        role="tablist"
        aria-orientation="vertical"
        aria-label={words.pages}
        className="flex w-52 shrink-0 flex-col gap-1 border-e border-border px-2 py-4"
      >
        <button
          type="button"
          role="tab"
          id="agent-config-behaviour"
          aria-selected="true"
          aria-controls="agent-config-panel"
          className="focus-ring flex h-control-md items-center rounded-sm bg-accent-soft px-3 text-start text-body font-medium text-fg"
        >
          {words.pageNames.behaviour}
        </button>
      </div>
      <div
        role="tabpanel"
        id="agent-config-panel"
        aria-labelledby="agent-config-behaviour"
        className="min-w-0 flex-1 overflow-auto p-6"
      >
        {load.kind === "ready" ? (
          <div className="max-w-column">
            <BehaviourPage settings={load.value} save={save} />
          </div>
        ) : (
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">{words.loading(name)}</span>
            <SkeletonBar kind="value" />
            <SkeletonBar kind="value" />
          </div>
        )}
      </div>
    </div>
  );
}
