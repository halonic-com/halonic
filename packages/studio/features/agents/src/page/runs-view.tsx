import { inlineLinkClasses } from "@halonicjs/studio-kit";
import { useMemo } from "react";
import type { AgentRef, AgentsHost, AgentUser } from "../api.ts";
import { pageWords } from "./page-words.ts";
import { type Load, useLoad } from "./use-load.ts";

/** Props for {@link RunsView}. */
export interface RunsViewProps {
  readonly host: AgentsHost;
  readonly agent: AgentRef;
  readonly name: string;
  /** Opens the Runs page, for **Open the Runs page ›**; absent where the app can't open a place. */
  readonly openRuns?: (() => void) | undefined;
}

/**
 * The agent page's Runs view: what the agent's runs are, from the workflows that run it, read
 * again when a file changes.
 */
export function RunsView({ host, agent, name, openRuns }: RunsViewProps) {
  const { hubId, id } = agent;
  const source = useMemo(
    () => ({
      fetch: () => host.referencesTo({ hubId, id }),
      subscribe: (onChange: () => void) => host.subscribe(onChange),
    }),
    [host, hubId, id],
  );
  const users = useLoad<readonly AgentUser[]>(source);
  return (
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
