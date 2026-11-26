import { Field, Input, Select, type SelectOption } from "@halonicjs/studio-kit";
import { useAutoSaved, useReportNotSaved } from "@halonicjs/studio-shell";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type {
  AgentChange,
  AgentHarnessId,
  AgentSettings,
  AgentsHost,
  AliasSummary,
} from "../api.ts";
import { ReviewMark } from "../review/review-marks.tsx";
import { AliasLine, type OpenAlias } from "./alias-line.tsx";
import { configurationWords as words } from "./configuration-words.ts";
import { MoreSettings } from "./more-settings.tsx";
import { useAliasSummary } from "./use-alias-summary.ts";

/** The model call limit a file gets when the field is left empty (`agents.editor.max-steps-default`). */
export const DEFAULT_TURN_LIMIT = 6;

/** The sentence for a model call limit that isn't a whole number from 1 to 200; `null` when it is fine, or empty. */
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

/**
 * The sentence for an alias whose provider the agent's harness can't call, as `halonic run` and
 * `halonic validate` decide it (flow 5.6, UX 2.5); `null` when it can, or the host can't tell.
 */
export const harnessModelCheck = (
  harness: AgentHarnessId,
  summary: AliasSummary | undefined,
): string | null => {
  if (harness === "halonic" || summary?.harnessFit?.[harness] !== "refused") return null;
  return words.harnessRefused[harness];
};

/** Props for {@link ModelPage}. */
export interface ModelPageProps {
  /** The host, for the provider, model and price of the alias picked. */
  readonly host: AgentsHost;
  readonly settings: AgentSettings;
  /** The model aliases the agent's hub can use. */
  readonly aliases: readonly string[];
  /** The model the agent runs on while its file names none; `undefined` when the workspace has no default. */
  readonly defaultModel?: string | undefined;
  /** Saves one change; resolves to whether it was written. */
  readonly save: (change: AgentChange) => Promise<boolean>;
  /** Hears how many fields aren't saved, for the toolbar's "1 field not saved". */
  readonly reportNotSaved?: ((count: number) => void) | undefined;
  /** Whether the picker should take the focus, as when the page was opened at the model. */
  readonly focus?: boolean;
  /** Called once the picker took the focus. */
  readonly onFocused?: () => void;
  /** Opens an alias on Models, for the line under the picker; absent where the window can't. */
  readonly openAlias?: OpenAlias | undefined;
}

/**
 * The Model page (`agents.configuration.model`): the model, picked from the workspace's aliases,
 * with the alias's provider, model and price on the line under it, the model call limit, and the model settings folded under More settings. Each saves by itself. A
 * model call limit with a mistake isn't saved, and counts as a field not saved, as does one whose
 * save failed.
 */
export function ModelPage({
  host,
  settings,
  aliases,
  defaultModel,
  save,
  reportNotSaved,
  focus = false,
  onFocused,
  openAlias,
}: ModelPageProps) {
  const [model, setModel] = useState(settings.model ?? "");
  // Only an alias of the hub has a line: a `provider/model` name or a missing alias has none.
  const summary = useAliasSummary(host, settings, aliases.includes(model) ? model : "");
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
  const [moreNotSaved, setMoreNotSaved] = useState(0);
  useReportNotSaved(reportNotSaved, [turnLimit], moreNotSaved);
  // A model the file names that isn't an alias stays in the list, so it isn't lost. A
  // `provider/model` name is fine as it is; an alias the hub doesn't have gets an error under it.
  const options: SelectOption[] = aliases.map((alias) => ({ value: alias, label: alias }));
  if (model !== "" && !aliases.includes(model)) options.push({ value: model, label: model });
  const aliasHint = summary && (
    <AliasHint alias={model} summary={summary} harness={settings.harness} openAlias={openAlias} />
  );
  return (
    <div className="flex flex-col gap-6">
      <ReviewMark agent={settings} field="model">
        <Field
          label={words.model}
          hint={aliases.length === 0 ? words.noAliases : aliasHint}
          error={modelCheck(model, aliases) ?? harnessModelCheck(settings.harness, summary)}
        >
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
      </ReviewMark>
      <ReviewMark agent={settings} field="maxSteps">
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
      </ReviewMark>
      <ReviewMark agent={settings} field="params">
        <MoreSettings params={settings.params} save={save} reportNotSaved={setMoreNotSaved} />
      </ReviewMark>
    </div>
  );
}

/**
 * The picker's hint: the alias line, so a screen reader hears it on the picker, with flow 5.6's
 * endpoint warning under it for a Codex agent on an OpenAI-compatible provider.
 */
function AliasHint({
  alias,
  summary,
  harness,
  openAlias,
}: {
  readonly alias: string;
  readonly summary: AliasSummary;
  readonly harness: AgentHarnessId;
  readonly openAlias: OpenAlias | undefined;
}) {
  return (
    <>
      <AliasLine alias={alias} summary={summary} harness={harness} openAlias={openAlias} />
      {summary.harnessFit?.[harness] === "check-endpoint" && (
        <span className="block text-fg-muted">{words.responsesApiWarning}</span>
      )}
    </>
  );
}
