import { KindedError } from "@halonicjs/std";
import {
  Button,
  CloseIcon,
  Dialog,
  EmptyState,
  Field,
  Input,
  inlineLinkClasses,
  List,
  type ListRow,
  PlusIcon,
  SkeletonBar,
  useToastStore,
} from "@halonicjs/studio-kit";
import { errorReasonFor } from "@halonicjs/studio-shell";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  type AgentListing,
  type AgentSettings,
  type AgentsHost,
  type AgentTeamMember,
  alreadyHandsWork,
  handOffPath,
} from "../api.ts";
import { newAgentWords } from "../new/new-agent-words.ts";
import { useLoad } from "../page/use-load.ts";
import { configurationWords as words } from "./configuration-words.ts";

/** Props for {@link SubagentsPage}. */
export interface SubagentsPageProps {
  /** The host, for the hub's agents, saving the list and creating a new agent. */
  readonly host: AgentsHost;
  readonly settings: AgentSettings;
  /** Opens a subagent as a card on top of the panel; absent where there are no cards. */
  readonly openSubagent?: ((agent: AgentListing) => void) | undefined;
  /** Reads text to screen readers, politely; absent says nothing. */
  readonly announce?: ((text: string) => void) | undefined;
}

/** An agent of the hub that can't be a subagent, and why. */
interface LoopingAgent {
  readonly member: AgentTeamMember;
  readonly reason: string;
}

/**
 * The Subagents page (`agents.configuration.subagents`): the agents this one hands work to, as
 * chips with ✕; the agents that would close a loop as disabled chips with their reason; and **Add
 * subagent**, whose dialog lists the agents that wouldn't loop, or creates a new one. Each change
 * saves the whole list at once, and a saved change is read politely: "Writer added." A change the
 * host refuses shows its reason in a toast and changes nothing (flow-agents 5.4, a11y SA2).
 */
export function SubagentsPage({ host, settings, openSubagent, announce }: SubagentsPageProps) {
  const { hubId, id, name } = settings;
  const source = useMemo(
    () => ({
      fetch: () => host.team({ hubId, id }),
      subscribe: (onChange: () => void) => host.subscribe(onChange),
    }),
    [host, hubId, id],
  );
  const team = useLoad<readonly AgentTeamMember[]>(source);
  const toasts = useToastStore();
  const [ids, setIds] = useState(settings.subagents);
  useEffect(() => setIds(settings.subagents), [settings.subagents]);
  const [adding, setAdding] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  if (team.load.kind === "loading") {
    return (
      <div className="flex flex-col gap-4">
        <SkeletonBar kind="value" />
        <SkeletonBar kind="value" />
      </div>
    );
  }
  if (team.load.kind === "failed") {
    return (
      <EmptyState
        tone="error"
        align="start"
        headingLevel={3}
        title={words.teamLoadFailedTitle}
        description={team.load.reason}
        action={{ label: words.tryAgain, onClick: team.retry, busy: team.load.retrying }}
      />
    );
  }
  const members = team.load.value;
  const nameOf = (each: string) => members.find((member) => member.id === each)?.name ?? each;
  const others = members.filter((member) => member.id !== id && !ids.includes(member.id));
  const looping: LoopingAgent[] = [];
  const pickable: AgentTeamMember[] = [];
  for (const member of others) {
    const way = handOffPath(members, member.id, id);
    if (way === undefined) pickable.push(member);
    else looping.push({ member, reason: alreadyHandsWork(way.map(nameOf)) });
  }

  /**
   * Saves the list and then reads `saved`; when the host refuses, the chips go back and a toast
   * says why. Focus stays where it lands: on a new chip's ✕, the next Enter would undo the add.
   */
  const change = async (next: readonly string[], saved: string) => {
    const before = ids;
    setIds(next);
    try {
      await host.update({ hubId, id }, { subagents: next });
      announce?.(saved);
    } catch (error) {
      setIds(before);
      const loop = error instanceof KindedError && error.kind === "conflict";
      toasts?.show(
        loop
          ? { tone: "danger", title: errorReasonFor(error) }
          : { tone: "danger", title: words.subagentsNotSaved(name), text: errorReasonFor(error) },
      );
    }
  };
  const remove = (each: string, index: number) => {
    void change(
      ids.filter((_, at) => at !== index),
      words.subagentRemoved(nameOf(each)),
    );
    // The ✕ that was pressed is gone: focus goes to the next chip's ✕, else Add subagent.
    queueMicrotask(() => {
      const next = list.current?.querySelectorAll<HTMLButtonElement>("button[aria-label]")[index];
      (next ?? addButton.current)?.focus();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-fg-muted">{words.subagentsIntro(name)}</p>
      {(ids.length > 0 || looping.length > 0) && (
        <ul ref={list} className="flex flex-col gap-2">
          {ids.length > 0 && (
            <li>
              <ul className="flex flex-wrap gap-2">
                {ids.map((each, index) => (
                  <li
                    key={each}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-subtle ps-3 text-body text-fg"
                  >
                    <SubagentName
                      name={nameOf(each)}
                      member={members.find((member) => member.id === each)}
                      openSubagent={openSubagent}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<CloseIcon />}
                      label={words.removeTool(nameOf(each))}
                      onClick={() => remove(each, index)}
                    />
                  </li>
                ))}
              </ul>
            </li>
          )}
          {looping.map(({ member, reason }) => (
            <li key={member.id} className="flex flex-wrap items-center gap-2">
              <span
                aria-disabled="true"
                className="inline-flex h-7 items-center rounded-full border border-border px-3 text-body text-fg-subtle"
              >
                {member.name}
              </span>
              <span className="text-small text-fg-muted">{reason}</span>
            </li>
          ))}
        </ul>
      )}
      <div>
        <Button
          ref={addButton}
          variant="secondary"
          size="sm"
          icon={<PlusIcon />}
          onClick={() => setAdding(true)}
        >
          {words.addSubagent}
        </Button>
      </div>
      {adding && (
        <AddSubagentDialog
          agent={name}
          pickable={pickable}
          add={(each) => {
            setAdding(false);
            void change([...ids, each], words.subagentAdded(nameOf(each)));
          }}
          create={async (newName) => {
            const made = await host.create({ name: newName, hubId });
            setAdding(false);
            await change([...ids, made.id], words.subagentCreated(newName));
          }}
          onCancel={() => setAdding(false)}
          returnFocus={() => addButton.current}
        />
      )}
    </div>
  );
}

/**
 * A subagent's name on its chip: a link that opens it as a card where the page has cards, else
 * plain text, as for an id the hub doesn't have.
 */
function SubagentName({
  name,
  member,
  openSubagent,
}: {
  readonly name: string;
  readonly member: AgentTeamMember | undefined;
  readonly openSubagent: ((agent: AgentListing) => void) | undefined;
}) {
  if (member === undefined || openSubagent === undefined) return <>{name}</>;
  return (
    <button type="button" className={inlineLinkClasses} onClick={() => openSubagent(member)}>
      {name}
    </button>
  );
}

interface AddSubagentDialogProps {
  /** The name of the agent the subagent is for. */
  readonly agent: string;
  /** The agents of the hub that wouldn't close a loop, sorted by name. */
  readonly pickable: readonly AgentTeamMember[];
  readonly add: (id: string) => void;
  /** Makes an agent with this name and adds it; rejects with the reason it couldn't. */
  readonly create: (name: string) => Promise<void>;
  readonly onCancel: () => void;
  readonly returnFocus: () => HTMLElement | null;
}

/**
 * "Add a subagent to *Mail triage*": **Pick an agent**, where a click adds it and closes, then
 * **Or create a new agent** with a name box and **Create**, which stays pressable while the box is
 * empty and then says "Give it a name." On the desktop focus starts on the first agent to pick,
 * else in the name box (flow-agents 5.4, accessibility A1 and SA1).
 */
function AddSubagentDialog({
  agent,
  pickable,
  add,
  create,
  onCancel,
  returnFocus,
}: AddSubagentDialogProps) {
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);
  const pickSection = useRef<HTMLElement>(null);
  const pickId = useId();
  const createId = useId();

  const submit = async () => {
    setFailure(undefined);
    if (name.trim() === "") {
      setProblem(newAgentWords.nameMissing);
      nameField.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await create(name.trim());
    } catch (error) {
      setFailure(newAgentWords.createFailed(errorReasonFor(error).replace(/\.$/, "")));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={words.addSubagentTitle(agent)}
      size="sm"
      form
      confirm={{ label: newAgentWords.create, busyLabel: newAgentWords.creating }}
      retryLabel={newAgentWords.tryAgain}
      busy={busy}
      {...(failure === undefined ? {} : { error: failure })}
      onConfirm={() => void submit()}
      onCancel={onCancel}
      returnFocus={returnFocus}
      // Picking comes first on the screen, so focus starts on the first agent to pick, not in
      // the name box under it; with nothing to pick, the name box (a11y SA1).
      initialFocus={() =>
        pickSection.current?.querySelector<HTMLElement>("[role=gridcell]") ?? null
      }
    >
      <div className="flex flex-col gap-4">
        {pickable.length > 0 && (
          <section ref={pickSection} aria-labelledby={pickId} className="flex flex-col gap-1">
            <h3 id={pickId} className="text-body-strong text-fg">
              {words.pickAnAgent}
            </h3>
            {/* The List's rows, in a box with a fill on hover and focus, so each agent reads as
                something to press next to the bordered name box (HAL-14105). The box stays on a
                phone too, where a List is flush: in the dialog there's no page edge to run to. */}
            <List
              label={words.pickAnAgent}
              flush={false}
              rows={pickable.map(pickRow)}
              onOpen={(id) => {
                // While a new agent is being made the rows stay focusable; a click waits.
                if (!busy) add(id);
              }}
            />
          </section>
        )}
        <section aria-labelledby={createId} className="flex flex-col gap-1">
          <h3 id={createId} className="text-body-strong text-fg">
            {pickable.length > 0 ? words.orCreate : words.newAgent}
          </h3>
          <Field label={words.newAgentName} hideLabel error={problem ?? null}>
            <Input
              ref={nameField}
              placeholder={words.newAgentPlaceholder}
              readOnly={busy}
              value={name}
              onChange={(event) => {
                setProblem(undefined);
                setName(event.target.value);
              }}
            />
          </Field>
        </section>
      </div>
    </Dialog>
  );
}

/** An agent to pick: its name, over its whole description when it has one. */
function pickRow(member: AgentTeamMember): ListRow {
  const hasDescription = member.description !== undefined && member.description !== "";
  return {
    id: member.id,
    title: member.name,
    wrap: true,
    ...(hasDescription ? { meta: member.description } : {}),
  };
}
