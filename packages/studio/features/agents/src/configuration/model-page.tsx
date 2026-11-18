import { Field, Input, Select, type SelectOption } from "@halonicjs/studio-kit";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { AgentChange, AgentSettings } from "../api.ts";
import { configurationWords as words } from "./configuration-words.ts";
import { useAutoSaved } from "./use-auto-saved.ts";

/** The turn limit a file gets when the field is left empty (`agents.editor.max-steps-default`). */
export const DEFAULT_TURN_LIMIT = 6;

/** The sentence for a turn limit that isn't a whole number from 1 to 200; `null` when it is fine, or empty. */
export const turnLimitCheck = (text: string): string | null => {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const number = Number(trimmed);
  return /^\d+$/.test(trimmed) && number >= 1 && number <= 200 ? null : words.turnLimitInvalid;
};

/** Props for {@link ModelPage}. */
export interface ModelPageProps {
  readonly settings: AgentSettings;
  /** The model aliases the agent's hub can use. */
  readonly aliases: readonly string[];
  /** The model the agent runs on while its file names none; `undefined` when the workspace has no default. */
  readonly defaultModel?: string | undefined;
  /** Saves one change; rejects with the reason it couldn't write. */
  readonly save: (change: AgentChange) => Promise<void>;
  /** Whether the picker should take the focus, as when the page was opened at the model. */
  readonly focus?: boolean;
  /** Called once the picker took the focus. */
  readonly onFocused?: () => void;
}

/**
 * The Model page (`agents.configuration.model`): the model, picked from the workspace's aliases,
 * and the turn limit. Both save by themselves. A turn limit with a mistake isn't saved.
 */
export function ModelPage({
  settings,
  aliases,
  defaultModel,
  save,
  focus = false,
  onFocused,
}: ModelPageProps) {
  const [model, setModel] = useState(settings.model ?? "");
  const picker = useRef<HTMLElement>(null);
  const focusPicker = useEffectEvent(() => {
    picker.current?.focus();
    onFocused?.();
  });
  useEffect(() => {
    if (!focus) return;
    // A moment later, after the shell focuses the page's heading as the tab is shown.
    const timer = window.setTimeout(focusPicker, 0);
    return () => window.clearTimeout(timer);
  }, [focus]);
  useEffect(() => setModel(settings.model ?? ""), [settings.model]);
  const turnLimit = useAutoSaved(
    String(settings.maxSteps),
    (next) => save({ maxSteps: next.trim() === "" ? DEFAULT_TURN_LIMIT : Number(next) }),
    turnLimitCheck,
  );
  // A model the file names that isn't an alias (`provider/model`) stays in the list, so it isn't lost.
  const options: SelectOption[] = aliases.map((alias) => ({ value: alias, label: alias }));
  if (model !== "" && !aliases.includes(model)) options.push({ value: model, label: model });
  return (
    <div className="flex flex-col gap-6">
      <Field label={words.model} hint={aliases.length === 0 ? words.noAliases : undefined}>
        <Select
          ref={picker}
          options={options}
          value={model}
          placeholder={
            defaultModel === undefined ? words.chooseModel : words.workspaceDefault(defaultModel)
          }
          onChange={(next) => {
            setModel(next);
            void save({ model: next });
          }}
        />
      </Field>
      <Field label={words.turnLimit} hint={words.turnLimitHint} error={turnLimit.error}>
        <Input
          inputMode="numeric"
          value={turnLimit.value}
          onChange={(event) => turnLimit.onChange(event.target.value)}
          onBlur={turnLimit.flush}
        />
      </Field>
    </div>
  );
}
