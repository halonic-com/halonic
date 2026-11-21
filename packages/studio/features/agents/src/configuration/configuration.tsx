import {
  EmptyState,
  Select,
  SkeletonBar,
  type Tab,
  TabList,
  TabPanel,
  usePresentation,
  useTabIds,
} from "@halonicjs/studio-kit";
import type { ItemPageSectionListing, SectionsProps } from "@halonicjs/studio-shell";
import {
  type ComponentType,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  AgentChange,
  AgentListing,
  AgentSettings,
  AgentStep,
  AgentsHost,
  AgentToolList,
} from "../api.ts";
import type { Load } from "../page/use-load.ts";
import { AgentStepsPage } from "./agent-steps-page.tsx";
import { BehaviourPage } from "./behaviour-page.tsx";
import { configurationWords as words } from "./configuration-words.ts";
import { HarnessPage } from "./harness-page.tsx";
import { ModelPage } from "./model-page.tsx";
import { SubagentsPage } from "./subagents-page.tsx";
import { ToolsPage } from "./tools-page.tsx";
import { useNarrowPanel } from "./use-narrow-panel.ts";

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
  /** Opens a subagent as a card on top of the panel; absent where there are no cards. */
  readonly openSubagent?: ((agent: AgentListing) => void) | undefined;
  /** Opens an agent step as a card on top of the panel; absent where there are no cards. */
  readonly openAgentStep?: ((step: AgentStep) => void) | undefined;
  /**
   * In a narrow panel, such as a subagent's card, the page list is a Select at the top instead of
   * a list at the side (flow-agents 5.1).
   */
  readonly narrow?: boolean | undefined;
  /** Reads text to screen readers, politely, for the Subagents page's changes. */
  readonly announce?: ((text: string) => void) | undefined;
  /** The sections other features add to the agent's page, such as Routines' Triggers; each is a page. */
  readonly sections?: readonly ItemPageSectionListing[] | undefined;
  /** Draws a section of {@link sections}; the shell's, absent where there's no window. */
  readonly Sections?: ComponentType<SectionsProps> | undefined;
  /**
   * Whether a request to open at the model (`agents.configuration.open-at-model`) is waiting: the
   * Model page is then shown with its picker focused, and `onModelShown` called.
   */
  readonly showModel?: boolean;
  /** Called once the Model page was shown for the waiting request, which then stops waiting. */
  readonly onModelShown?: () => void;
  /** Where it opens, for the agent map's add buttons; on Behaviour when absent. */
  readonly start?: ConfigurationStart | undefined;
}

type BuiltPageId = "behaviour" | "model" | "harness" | "tools" | "subagents" | "agentSteps";

/** A page: one of the agents feature's own, or a section another feature adds, by its id. */
type PageId = BuiltPageId | `section:${string}`;

/**
 * Where Configuration opens, for the agent map's add buttons: on a page, one of its own or a
 * section's by its id, and for Subagents, `adding` opens its Add subagent dialog. With `focus`,
 * the page's name in the list takes the focus, since the button that was pressed is gone.
 */
export interface ConfigurationStart {
  readonly page: PageId;
  readonly adding?: boolean | undefined;
  readonly focus?: boolean | undefined;
}

/** The pages that are built, in the order of flow-agents 5.1. */
const builtPages: readonly Tab<PageId>[] = (
  ["behaviour", "model", "harness", "tools", "subagents", "agentSteps"] as const
).map((id) => ({ id, label: words.pageNames[id] }));

/** Where Configuration opens unless it's asked to open elsewhere. */
const onBehaviour: ConfigurationStart = { page: "behaviour" };

/** The list's pages: the built ones, then a page per section, when the sections can be drawn. */
function pageTabs(
  sections: readonly ItemPageSectionListing[],
  Sections: ComponentType<SectionsProps> | undefined,
): readonly Tab<PageId>[] {
  if (Sections === undefined) return builtPages;
  return [
    ...builtPages,
    ...sections.map((section) => ({ id: `section:${section.id}` as const, label: section.title })),
  ];
}

/** The picked page, or Behaviour when it's a section's page that is gone because its feature went. */
function shownPage(pages: readonly Tab<PageId>[], picked: PageId): PageId {
  return pages.some((one) => one.id === picked) ? picked : "behaviour";
}

/** The page of a section another feature adds; nothing for one of the agents feature's own pages. */
function SectionPage({
  page,
  Sections,
}: {
  readonly page: PageId;
  readonly Sections: ComponentType<SectionsProps> | undefined;
}) {
  if (Sections === undefined || !page.startsWith("section:")) return null;
  return <Sections only={page.slice("section:".length)} />;
}

/**
 * The agent's Configuration (`agents.configuration.pages`): a list of pages on the left and the
 * picked page beside it. A page that isn't built is absent, not empty (flow-agents 5.1). The
 * sections other features add, such as Triggers, follow the agents feature's own pages
 * (`agents.configuration.section-pages`). On a phone, and in a panel too narrow for the column,
 * the list goes across the top instead, so the page keeps the full width
 * (`agents.configuration.pages-phone`, `agents.configuration.pages-narrow`).
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
  openSubagent,
  openAgentStep,
  narrow = false,
  announce,
  sections = [],
  Sections,
  showModel = false,
  onModelShown,
  start = onBehaviour,
}: ConfigurationProps) {
  const [picked, setPage] = useState<PageId>(start.page);
  const pages = pageTabs(sections, Sections);
  const page = shownPage(pages, picked);
  // The Add subagent dialog opens once per press: once Subagents has been shown, coming back to it
  // doesn't open the dialog again.
  const [startAdding, setStartAdding] = useState(start.adding === true);
  useEffect(() => {
    if (page === "subagents") setStartAdding(false);
  }, [page]);
  // The picker takes the focus once for each request, so a later click on Model doesn't move it.
  const [focusModel, setFocusModel] = useState(false);
  const modelShown = useEffectEvent(() => onModelShown?.());
  // Before the page is drawn, so Behaviour doesn't flash first.
  useLayoutEffect(() => {
    if (!showModel) return;
    setPage("model");
    setFocusModel(true);
    modelShown();
  }, [showModel]);
  const ids = useTabIds();
  const phone = usePresentation() === "phone";
  const panel = useNarrowPanel();
  // One rule for the layout: a card's Select, a phone and a narrow panel all stack the list on top.
  const across = narrow || phone || panel.narrow;
  // Instructions takes the focus once; going to another page and back leaves it alone.
  const [focusInstructions, setFocusInstructions] = useState(startOnInstructions === true);
  const pickPage = (id: PageId) => {
    setPage(id);
    setFocusInstructions(false);
  };
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
    <div
      ref={panel.ref}
      className={across ? "flex min-h-0 flex-1 flex-col" : "flex min-h-0 flex-1"}
    >
      <PageList
        narrow={narrow}
        across={across}
        ids={ids}
        pages={pages}
        page={page}
        onPick={pickPage}
        focusPage={start.focus === true}
      />
      <PagePanel narrow={narrow} ids={ids} pages={pages} page={page}>
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
                  focus={focusModel}
                  onFocused={() => setFocusModel(false)}
                />
              ))}
            {page === "harness" && <HarnessPage host={host} settings={load.value} save={save} />}
            {page === "tools" && (
              <ToolsPage host={host} settings={load.value} save={save} openLibrary={openLibrary} />
            )}
            {page === "subagents" && (
              <SubagentsPage
                host={host}
                settings={load.value}
                openSubagent={openSubagent}
                announce={announce}
                startAdding={startAdding}
              />
            )}
            {page === "agentSteps" && (
              <AgentStepsPage host={host} settings={load.value} openAgentStep={openAgentStep} />
            )}
            <SectionPage page={page} Sections={Sections} />
          </div>
        ) : (
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">{words.loading(name)}</span>
            <SkeletonBar kind="value" />
            <SkeletonBar kind="value" />
          </div>
        )}
      </PagePanel>
    </div>
  );
}

/**
 * The list of pages: a Select at the top of a subagent's card, tabs across the top on a phone or
 * in a panel too narrow for the column, and tabs at the side elsewhere.
 */
function PageList({
  narrow,
  across,
  ids,
  pages,
  page,
  onPick,
  focusPage,
}: {
  readonly narrow: boolean;
  readonly across: boolean;
  readonly ids: ReturnType<typeof useTabIds>;
  readonly pages: readonly Tab<PageId>[];
  readonly page: PageId;
  readonly onPick: (page: PageId) => void;
  /** Focuses the shown page's name once, when the list is first drawn. */
  readonly focusPage: boolean;
}) {
  const list = useRef<HTMLDivElement>(null);
  // Once, for the page it opened on.
  useEffect(() => {
    if (!focusPage) return;
    list.current?.querySelector<HTMLElement>("[aria-selected='true'], select")?.focus();
  }, []);
  if (narrow) {
    return (
      <div ref={list} className="px-4 pt-4">
        <Select
          aria-label={words.pages}
          options={pages.map((each) => ({ value: each.id, label: each.label }))}
          value={page}
          onChange={(next) => onPick(next as PageId)}
        />
      </div>
    );
  }
  return (
    <div
      ref={list}
      className={
        across
          ? "border-b border-border px-4 py-3"
          : "w-52 shrink-0 border-e border-border px-2 py-4"
      }
    >
      <TabList
        label={words.pages}
        orientation={across ? "horizontal" : "vertical"}
        tabs={pages}
        selected={page}
        onSelect={onPick}
        ids={ids}
      />
    </div>
  );
}

/**
 * The picked page: a tab panel beside the page list, or, in a narrow panel where the list is a
 * Select, a plain region under it, since a Select has no tabs to name it.
 */
function PagePanel({
  narrow,
  ids,
  pages,
  page,
  children,
}: {
  readonly narrow: boolean;
  readonly ids: ReturnType<typeof useTabIds>;
  readonly pages: readonly Tab<PageId>[];
  readonly page: PageId;
  readonly children: ReactNode;
}) {
  if (narrow) {
    const label = pages.find((each) => each.id === page)?.label;
    return (
      <section aria-label={label} className="min-w-0 flex-1 overflow-auto p-4">
        {children}
      </section>
    );
  }
  return (
    <TabPanel ids={ids} tabs={pages} selected={page} className="min-w-0 flex-1 overflow-auto p-6">
      {children}
    </TabPanel>
  );
}
