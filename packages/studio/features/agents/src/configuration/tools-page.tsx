import {
  Button,
  CloseIcon,
  EmptyState,
  inlineLinkClasses,
  Menu,
  PlusIcon,
  SkeletonBar,
} from "@halonicjs/studio-kit";
import { type RefObject, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  type AgentChange,
  type AgentSettings,
  type AgentsHost,
  type AgentToolList,
  type AgentToolOption,
  agentToolLists,
} from "../api.ts";
import { useLoad } from "../page/use-load.ts";
import { configurationWords as words } from "./configuration-words.ts";

/** Props for {@link ToolsPage}. */
export interface ToolsPageProps {
  /** The host, for the Library items the agent's hub can use. */
  readonly host: AgentsHost;
  readonly settings: AgentSettings;
  /** Saves one change; resolves to whether it was written, and never rejects. */
  readonly save: (change: AgentChange) => Promise<boolean>;
  /** Opens Library on the tab of a list, for **Open Library ›**; absent where the app can't. */
  readonly openLibrary?: ((list: AgentToolList) => void) | undefined;
}

type Options = Readonly<Record<AgentToolList, readonly AgentToolOption[]>>;

/**
 * The Tools page (`agents.configuration.tools`): the agent's skills, knowledge and connectors, each
 * a list of chips with an Add picker of the Library items its hub can use. Adding or removing one
 * saves the whole list at once. When the Library can't be read, the lists still show the agent's
 * chips, which come from its file, without the pickers.
 */
export function ToolsPage({ host, settings, save, openLibrary }: ToolsPageProps) {
  const { hubId, id } = settings;
  const source = useMemo(
    () => ({
      fetch: () => host.toolOptions({ hubId, id }),
      subscribe: (onChange: () => void) => host.subscribe(onChange),
    }),
    [host, hubId, id],
  );
  const lists = useRef<HTMLDivElement>(null);
  // Try again worked, so its button is gone: the reader goes on at the first list's heading (the
  // failure's own heading is an h3 too, and goes with it).
  const options = useLoad<Options>(source, () =>
    lists.current?.querySelector<HTMLElement>("section h3")?.focus(),
  );
  if (options.load.kind === "loading") {
    return (
      <div className="flex flex-col gap-4">
        <SkeletonBar kind="value" />
        <SkeletonBar kind="value" />
      </div>
    );
  }
  const ready = options.load.kind === "ready" ? options.load.value : undefined;
  return (
    <div ref={lists} className="flex flex-col gap-6">
      {options.load.kind === "failed" && (
        <EmptyState
          tone="error"
          align="start"
          headingLevel={3}
          title={words.toolsLoadFailedTitle}
          description={options.load.reason}
          action={{ label: words.tryAgain, onClick: options.retry, busy: options.load.retrying }}
        />
      )}
      {agentToolLists.map((list) => (
        <ToolList
          key={list}
          list={list}
          chosen={settings[list]}
          options={ready?.[list]}
          save={(next) => save({ [list]: next })}
          openLibrary={openLibrary && (() => openLibrary(list))}
        />
      ))}
    </div>
  );
}

interface ToolListProps {
  readonly list: AgentToolList;
  /** The ids the agent's file names. */
  readonly chosen: readonly string[];
  /** What the hub can use; `undefined` while the Library can't be read. */
  readonly options: readonly AgentToolOption[] | undefined;
  readonly save: (next: readonly string[]) => Promise<boolean>;
  readonly openLibrary: (() => void) | undefined;
}

/**
 * One list of the Tools page: a chip per item with its ✕, and the Add picker. An id the hub
 * can't use (a file edited by hand) still shows as a chip, by its id, with a danger edge and a
 * line that says so, and ✕ removes it. While the Library can't be read there is no picker and
 * no such line, as the page can't know an item is missing.
 */
function ToolList({ list, chosen, options, save, openLibrary }: ToolListProps) {
  const [ids, setIds] = useState(chosen);
  useEffect(() => setIds(chosen), [chosen]);
  const section = useRef<HTMLElement>(null);
  const openLibraryButton = useRef<HTMLButtonElement>(null);
  const headingId = `agent-tools-${list}`;
  const lineIds = useId();
  const nameOf = (id: string) => options?.find((option) => option.id === id)?.name ?? id;
  const missing = (id: string) =>
    options !== undefined && !options.some((option) => option.id === id);
  /** The id of the line that says the hub can't use `id`. */
  const missingLineId = (id: string) => `${lineIds}-missing-${ids.indexOf(id)}`;
  const addable = options?.filter((option) => !ids.includes(option.id));

  // Set when the last item was added, until the list has drawn what took the Add button's place.
  const focusAfterLastAdd = useRef(false);
  useEffect(() => {
    if (!focusAfterLastAdd.current) return;
    focusAfterLastAdd.current = false;
    const addedRemove = section.current?.querySelector<HTMLElement>("li:last-child button");
    (openLibraryButton.current ?? addedRemove)?.focus();
  }, [ids]);

  const change = (next: readonly string[]) => {
    setIds(next);
    void save(next);
  };
  const remove = (id: string) => {
    change(ids.filter((each) => each !== id));
    // The ✕ that was pressed is gone, so focus goes to the first button left in the list.
    queueMicrotask(() => section.current?.querySelector("button")?.focus());
  };
  const add = (id: string) => {
    // The Add button goes with the last item, so focus goes to the line's Open Library › that
    // takes its place or, where the app has none, to the ✕ of the item just added.
    focusAfterLastAdd.current = addable?.length === 1;
    change([...ids, id]);
  };

  return (
    <section ref={section} aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} tabIndex={-1} className="text-body-strong text-fg outline-none">
        {words.toolLists[list]}
      </h3>
      {ids.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {ids.map((id) => (
            <li
              key={id}
              className={`inline-flex items-center gap-1 rounded-full border bg-surface-subtle ps-3 text-body text-fg ${
                missing(id) ? "border-danger" : "border-border"
              }`}
            >
              {nameOf(id)}
              <Button
                variant="ghost"
                size="sm"
                icon={<CloseIcon />}
                label={words.removeTool(nameOf(id))}
                {...(missing(id) && { "aria-describedby": missingLineId(id) })}
                onClick={() => remove(id)}
              />
            </li>
          ))}
        </ul>
      )}
      {ids.filter(missing).map((id) => (
        <p key={id} id={missingLineId(id)} className="text-small text-danger">
          {words.missingTool[list](id)}
        </p>
      ))}
      {options !== undefined && addable !== undefined && (
        <AddTool
          list={list}
          options={options}
          addable={addable}
          add={add}
          openLibrary={openLibrary}
          openLibraryRef={openLibraryButton}
        />
      )}
    </section>
  );
}

/**
 * Under a list: the Add picker, or, when there is nothing to pick, a quiet line in its place that
 * says why, with **Open Library ›** (N5: Studio knows before the press).
 */
function AddTool({
  list,
  options,
  addable,
  add,
  openLibrary,
  openLibraryRef,
}: {
  readonly list: AgentToolList;
  readonly options: readonly AgentToolOption[];
  readonly addable: readonly AgentToolOption[];
  readonly add: (id: string) => void;
  readonly openLibrary: (() => void) | undefined;
  readonly openLibraryRef: RefObject<HTMLButtonElement | null>;
}) {
  if (addable.length === 0) {
    return (
      <p className="text-caption text-fg-muted">
        {options.length === 0 ? words.noneInLibrary[list] : words.allAdded[list]}
        {openLibrary && (
          <>
            {" "}
            <button
              ref={openLibraryRef}
              type="button"
              className={inlineLinkClasses}
              onClick={openLibrary}
            >
              {words.openLibrary}
            </button>
          </>
        )}
      </p>
    );
  }
  return (
    <div>
      <Menu
        trigger={(props) => (
          <Button {...props} variant="secondary" size="sm" icon={<PlusIcon />}>
            {words.addTool[list]}
          </Button>
        )}
        entries={addable.map((option) => ({
          id: option.id,
          label: option.name,
          onSelect: () => add(option.id),
        }))}
      />
    </div>
  );
}
