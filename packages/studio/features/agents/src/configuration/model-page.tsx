import { Field, Input, Select, type SelectOption } from "@halonicjs/studio-kit";
import { useEffect, useState } from "react";
import type { AgentChange, AgentSettings } from "../api.ts";
import { configurationWords as words } from "./configuration-words.ts";
import { MoreSettings } from "./more-settings.tsx";
import { useAutoSaved, useReportNotSaved } from "./use-auto-saved.ts";

/** The turn limit a file gets when the field is left empty (`agents.editor.max-steps-default`). */
export const DEFAULT_TURN_LIMIT = 6;

/** The sentence for a turn limit that isn't a whole number from 1 to 200; `null` when it is fine, or empty. */
export const turnLimitCheck = (text: string): string | null => {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const number = Number(trimmed);
  return /^\d+$/.test(trimmed) && number >= 1 && number <= 200 ? null : words.turnLimitInvalid;
};

/**
 * The sentence for a model the file names that the hub has no alias for; `null` when there is
 * none, it is an alias, or it names a model directly (`provider/model`, which needs no alias).
 */
export const modelCheck = (model: string, aliases: readonly string[]): string | null => {
  if (model === "" || model.includes("/") || aliases.includes(model)) return null;
  return words.unknownAlias(model);
};

/** Props for {@link ModelPage}. */
export interface ModelPageProps {
  readonly settings: AgentSettings;
  /** The model aliases the agent's hub can use. */
  readonly aliases: readonly string[];
  /** The model the agent runs on while its file names none; `undefined` when the workspace has no default. */
  readonly defaultModel?: string | undefined;
  /** Saves one change; resolves to whether it was written. */
  readonly save: (change: AgentChange) => Promise<boolean>;
  /** Hears how many fields aren't saved, for the toolbar's "1 field not saved". */
  readonly reportNotSaved?: ((count: number) => void) | undefined;
}

/**
 * The Model page (`agents.configuration.model`): the model, picked from the workspace's aliases,
 * the turn limit, and the model settings folded under More settings. Each saves by itself. A turn
 * limit with a mistake isn't saved, and counts as a field not saved, as does one whose save failed.
 */
export function ModelPage({
  settings,
  aliases,
  defaultModel,
  save,
  reportNotSaved,
}: ModelPageProps) {
  const [model, setModel] = useState(settings.model ?? "");
  useEffect(() => setModel(settings.model ?? ""), [settings.model]);
  const turnLimit = useAutoSaved(
    String(settings.maxSteps),
    (next) => save({ maxSteps: next.trim() === "" ? DEFAULT_TURN_LIMIT : Number(next) }),
    turnLimitCheck,
  );
  const [moreNotSaved, setMoreNotSaved] = useState(0);
  useReportNotSaved(reportNotSaved, [turnLimit], moreNotSaved);
  // A model the file names that isn't an alias stays in the list, so it isn't lost. A
  // `provider/model` name is fine as it is; an alias the hub doesn't have gets an error under it.
  const options: SelectOption[] = aliases.map((alias) => ({ value: alias, label: alias }));
  if (model !== "" && !aliases.includes(model)) options.push({ value: model, label: model });
  return (
    <div className="flex flex-col gap-6">
      <Field
        label={words.model}
        hint={aliases.length === 0 ? words.noAliases : undefined}
        error={modelCheck(model, aliases)}
      >
        <Select
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
      <Field
        label={words.turnLimit}
        hint={words.turnLimitHint}
        error={turnLimit.error}
        announceWhileFocused
      >
        <Input
          width="short"
          inputMode="numeric"
          value={turnLimit.value}
          onChange={(event) => turnLimit.onChange(event.target.value)}
          onBlur={turnLimit.flush}
        />
      </Field>
      <MoreSettings params={settings.params} save={save} reportNotSaved={setMoreNotSaved} />
    </div>
  );
}
