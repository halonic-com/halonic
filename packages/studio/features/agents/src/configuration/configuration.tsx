import {
  EmptyState,
  SkeletonBar,
  type Tab,
  TabList,
  TabPanel,
  usePresentation,
  useTabIds,
} from "@halonicjs/studio-kit";
import { useState } from "react";
import type { AgentChange, AgentSettings, AgentsHost, AgentToolList } from "../api.ts";
import type { Load } from "../page/use-load.ts";
import { BehaviourPage } from "./behaviour-page.tsx";
import { configurationWords as words } from "./configuration-words.ts";
import { HarnessPage } from "./harness-page.tsx";
import { ModelPage } from "./model-page.tsx";
import { SubagentsPage } from "./subagents-page.tsx";
import { ToolsPage } from "./tools-page.tsx";

/** Props for {@link Configuration}. */
export interface ConfigurationProps {
  /** The host, for the Harness page's check of the programs on this computer and the Tools page's pickers. */
  readonly host: AgentsHost;
  readonly name: string;
  readonly load: Load<AgentSettings>;
  /** The model aliases the agent's hub can use, for the Model page. */
  readonly aliases: Load<readonly string[]>;
  /** The model an agent without one uses; `undefined` when the workspace has no default. */
  readonly defaultModel: string | undefined;
  readonly retryAliases: () => void;
  readonly retry: () => void;
  /** Saves one change; resolves to whether it was written, and never rejects. */
  readonly save: (change: AgentChange) => Promise<boolean>;
  /** Hears how many fields of the open page aren't saved, for the toolbar's "1 field not saved". */
  readonly reportNotSaved?: ((count: number) => void) | undefined;
  /** Opens Behaviour with Instructions focused, for an agent that was just made. */
  readonly startOnInstructions?: boolean | undefined;
  /** Opens Library on a Tools list's tab, for **Open Library ›**; absent where the app can't. */
  readonly openLibrary?: ((list: AgentToolList) => void) | undefined;
}

type PageId = "behaviour" | "model" | "harness" | "tools" | "subagents";

/** The pages that are built, in the order of flow-agents 5.1. */
const pages: readonly Tab<PageId>[] = (
  ["behaviour", "model", "harness", "tools", "subagents"] as const
).map((id) => ({ id, label: words.pageNames[id] }));

/**
 * The agent's Configuration (`agents.configuration.pages`): a list of pages on the left and the
 * picked page beside it. A page that isn't built is absent, not empty (flow-agents 5.1). On a
 * phone the list goes across the top instead, so the page keeps the full width
 * (`agents.configuration.pages-phone`).
 */
export function Configuration({
  host,
  name,
  load,
  aliases,
  defaultModel,
  retryAliases,
  retry,
  startOnInstructions,
  save,
  openLibrary,
  reportNotSaved,
}: ConfigurationProps) {
  const [page, setPage] = useState<PageId>("behaviour");
  const ids = useTabIds();
  const phone = usePresentation() === "phone";
  // Instructions takes the focus once; going to another page and back leaves it alone.
  const [focusInstructions, setFocusInstructions] = useState(startOnInstructions === true);
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
    <div className={phone ? "flex min-h-0 flex-1 flex-col" : "flex min-h-0 flex-1"}>
      <div
        className={
          phone
            ? "border-b border-border px-4 py-3"
            : "w-52 shrink-0 border-e border-border px-2 py-4"
        }
      >
        <TabList
          label={words.pages}
          orientation={phone ? "horizontal" : "vertical"}
          tabs={pages}
          selected={page}
          onSelect={(id) => {
            setPage(id);
            setFocusInstructions(false);
          }}
          ids={ids}
        />
      </div>
      <TabPanel ids={ids} tabs={pages} selected={page} className="min-w-0 flex-1 overflow-auto p-6">
        {load.kind === "ready" ? (
          <div className="max-w-column">
            {page === "behaviour" && (
              <BehaviourPage
                settings={load.value}
                focusInstructions={focusInstructions}
                save={save}
                reportNotSaved={reportNotSaved}
              />
            )}
            {page === "model" &&
              (aliases.kind === "failed" ? (
                <EmptyState
                  tone="error"
                  title={words.modelsLoadFailedTitle}
                  description={aliases.reason}
                  action={{ label: words.tryAgain, onClick: retryAliases, busy: aliases.retrying }}
                />
              ) : (
                <ModelPage
                  settings={load.value}
                  aliases={aliases.kind === "ready" ? aliases.value : []}
                  defaultModel={defaultModel}
                  save={save}
                  reportNotSaved={reportNotSaved}
                />
              ))}
            {page === "harness" && <HarnessPage host={host} settings={load.value} save={save} />}
            {page === "tools" && (
              <ToolsPage host={host} settings={load.value} save={save} openLibrary={openLibrary} />
            )}
            {page === "subagents" && <SubagentsPage host={host} settings={load.value} />}
          </div>
        ) : (
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">{words.loading(name)}</span>
            <SkeletonBar kind="value" />
            <SkeletonBar kind="value" />
          </div>
        )}
      </TabPanel>
    </div>
  );
}
