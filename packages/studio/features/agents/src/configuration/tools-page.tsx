import { Button, CloseIcon, EmptyState, Menu, PlusIcon, SkeletonBar } from "@halonicjs/studio-kit";
import { useEffect, useMemo, useRef, useState } from "react";
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
  /** Saves one change; rejects with the reason it couldn't write. */
  readonly save: (change: AgentChange) => Promise<void>;
}

type Options = Readonly<Record<AgentToolList, readonly AgentToolOption[]>>;

/**
 * The Tools page (`agents.configuration.tools`): the agent's skills, knowledge and connectors, each
 * a list of chips with an Add picker of the Library items its hub can use. Adding or removing one
 * saves the whole list at once.
 */
export function ToolsPage({ host, settings, save }: ToolsPageProps) {
  const { hubId, id } = settings;
  const source = useMemo(
    () => ({
      fetch: () => host.toolOptions({ hubId, id }),
      subscribe: (onChange: () => void) => host.subscribe(onChange),
    }),
    [host, hubId, id],
  );
  const options = useLoad<Options>(source);
  if (options.load.kind === "failed") {
    return (
      <EmptyState
        tone="error"
        title={words.toolsLoadFailedTitle}
        description={options.load.reason}
        action={{ label: words.tryAgain, onClick: options.retry, busy: options.load.retrying }}
      />
    );
  }
  if (options.load.kind === "loading") {
    return (
      <div className="flex flex-col gap-4">
        <SkeletonBar kind="value" />
        <SkeletonBar kind="value" />
      </div>
    );
  }
  const ready = options.load.value;
  return (
    <div className="flex flex-col gap-6">
      {agentToolLists.map((list) => (
        <ToolList
          key={list}
          list={list}
          chosen={settings[list]}
          options={ready[list]}
          save={(next) => save({ [list]: next })}
        />
      ))}
    </div>
  );
}

interface ToolListProps {
  readonly list: AgentToolList;
  /** The ids the agent's file names. */
  readonly chosen: readonly string[];
  readonly options: readonly AgentToolOption[];
  readonly save: (next: readonly string[]) => Promise<void>;
}

/**
 * One list of the Tools page: a chip per item with its ✕, and the Add picker. An id the hub
 * can't use (a file edited by hand) still shows as a chip, by its id, so it can be removed.
 */
function ToolList({ list, chosen, options, save }: ToolListProps) {
  const [ids, setIds] = useState(chosen);
  useEffect(() => setIds(chosen), [chosen]);
  const section = useRef<HTMLElement>(null);
  const headingId = `agent-tools-${list}`;
  const nameOf = (id: string) => options.find((option) => option.id === id)?.name ?? id;
  const addable = options.filter((option) => !ids.includes(option.id));

  const change = (next: readonly string[]) => {
    setIds(next);
    void save(next);
  };
  const remove = (id: string) => {
    change(ids.filter((each) => each !== id));
    // The ✕ that was pressed is gone, so focus goes to the first button left in the list.
    queueMicrotask(() => section.current?.querySelector("button")?.focus());
  };

  return (
    <section ref={section} aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="text-body-strong text-fg">
        {words.toolLists[list]}
      </h3>
      {ids.length === 0 ? (
        <p className="text-body text-fg-muted">{words.noTools[list]}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {ids.map((id) => (
            <li
              key={id}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-subtle ps-3 text-body text-fg"
            >
              {nameOf(id)}
              <Button
                variant="ghost"
                size="sm"
                icon={<CloseIcon />}
                label={words.removeTool(nameOf(id))}
                onClick={() => remove(id)}
              />
            </li>
          ))}
        </ul>
      )}
      {addable.length === 0 ? (
        <p className="text-caption text-fg-muted">{words.nothingToAdd[list]}</p>
      ) : (
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
              onSelect: () => change([...ids, option.id]),
            }))}
          />
        </div>
      )}
    </section>
  );
}
