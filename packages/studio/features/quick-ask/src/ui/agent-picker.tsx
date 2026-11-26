import { Avatar, enter, isComposing } from "@halonicjs/studio-kit";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import type { AskAgent } from "../ask-session.ts";
import { quickAskWords } from "../quick-ask-words.ts";
import { agentKey, type PickerGroup, pickerGroups } from "./picker-groups.ts";

/** Where the focus goes when the picker closes without a pick: back to the text box, or on to Ask. */
export type PickerExit = "back" | "forward";

/** The props of {@link AgentPicker}. */
export interface AgentPickerProps {
  readonly agents: readonly AskAgent[];
  readonly picked: AskAgent;
  readonly onPick: (agent: AskAgent) => void;
  readonly onClose: (exit: PickerExit) => void;
}

const optionClasses = [
  "flex min-h-control-md cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-body",
  "aria-selected:bg-surface-muted",
  "outline-2 -outline-offset-2 outline-transparent aria-selected:outline-solid",
  "contrast-more:aria-selected:outline-border-control",
].join(" ");

/**
 * The agent picker (design HAL-18594, section 4): a search box over a listbox of agents only,
 * **Recent** first, then each workspace and team. Typing finds an agent, ↑/↓ moves, Enter picks,
 * Esc or Shift+Tab goes back to the text box, and Tab goes on to **Ask**. The focus stays in the
 * search box, which names the active row (the combobox pattern); a status line says when nobody
 * matches. It fades in as the kit's menus do.
 */
export function AgentPicker({ agents, picked, onPick, onClose }: AgentPickerProps) {
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState(agentKey(picked));
  const listId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const groups = pickerGroups(agents, query);
  const shown = groups.flatMap((group) => group.agents);
  const active = shown.find((each) => agentKey(each) === activeKey) ?? shown[0];
  const optionId = (agent: AskAgent) => `${listId}-${agentKey(agent)}`;

  useEffect(() => {
    if (panel.current !== null) void enter(panel.current, { move: "none" });
  }, []);

  function move(step: number) {
    const index = active === undefined ? -1 : shown.indexOf(active);
    const next = shown[(index + step + shown.length) % shown.length];
    if (next !== undefined) setActiveKey(agentKey(next));
  }

  const onKeyDown = pickerKeys({
    move,
    pick: active === undefined ? undefined : () => onPick(active),
    close: onClose,
  });

  return (
    <div ref={panel} data-agent-picker="" className="border-t border-border px-3.5 py-2">
      <input
        // biome-ignore lint/a11y/noAutofocus: the picker opens from Tab or a click, to type in.
        autoFocus
        type="text"
        role="combobox"
        aria-label={quickAskWords.findAgent}
        aria-expanded={shown.length > 0}
        aria-controls={listId}
        aria-activedescendant={active === undefined ? undefined : optionId(active)}
        aria-autocomplete="list"
        placeholder={quickAskWords.findAgent}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        className="w-full rounded-sm border border-border-control bg-surface px-2 py-1 text-body text-fg focus-ring"
      />
      <PickerList
        listId={listId}
        groups={groups}
        active={active}
        optionId={optionId}
        onPick={onPick}
      />
      {/* Always there, so screen readers hear it when no agent matches the text. */}
      <p role="status" className="px-2 text-body text-fg-muted">
        {shown.length === 0 ? quickAskWords.noMatch(query) : null}
      </p>
    </div>
  );
}

/** The picker's listbox: each group under its heading, and the active row filled. */
function PickerList({
  listId,
  groups,
  active,
  optionId,
  onPick,
}: {
  readonly listId: string;
  readonly groups: readonly PickerGroup[];
  readonly active: AskAgent | undefined;
  readonly optionId: (agent: AskAgent) => string;
  readonly onPick: (agent: AskAgent) => void;
}) {
  return (
    <div id={listId} role="listbox" aria-label={quickAskWords.findAgent} className="mt-2">
      {groups.map((group) => (
        // A listbox groups its options with role group; a fieldset would hold form fields.
        // biome-ignore lint/a11y/useSemanticElements: the options' group inside a listbox.
        <div key={group.label} role="group" aria-label={group.label}>
          <p aria-hidden="true" className="px-2 pt-2 pb-1 text-caption text-fg-muted">
            {group.label}
          </p>
          {group.agents.map((each) => (
            // The rows aren't focusable: the search box names the active one, and handles the keys.
            // biome-ignore lint/a11y/useKeyWithClickEvents: the search box handles the keys for every row.
            <div
              key={agentKey(each)}
              id={optionId(each)}
              role="option"
              tabIndex={-1}
              aria-selected={each === active}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onPick(each)}
              className={optionClasses}
            >
              <Avatar name={each.agent.name} />
              <span>{each.agent.name}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The search box's keys: ↑/↓ move, Enter picks, Esc and Shift+Tab go back to the text box, Tab
 * goes on to Ask. Each is the picker's alone, so Esc doesn't close the box as well.
 */
function pickerKeys(on: {
  readonly move: (step: number) => void;
  readonly pick: (() => void) | undefined;
  readonly close: (exit: PickerExit) => void;
}) {
  return (event: KeyboardEvent<HTMLInputElement>) => {
    if (isComposing(event)) return;
    const actions: Record<string, (() => void) | undefined> = {
      ArrowDown: () => on.move(1),
      ArrowUp: () => on.move(-1),
      Enter: on.pick,
      Escape: () => on.close("back"),
      Tab: () => on.close(event.shiftKey ? "back" : "forward"),
    };
    const action = actions[event.key];
    if (action === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    action();
  };
}
