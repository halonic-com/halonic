import { type FirstRunKeyProvider, firstRunKeyProviders, firstRunProviders } from "@halonicjs/app";
import {
  Callout,
  CommandBox,
  ExternalLink,
  Field,
  InfoIcon,
  Input,
  Select,
  Spinner,
  TickIcon,
  WarningIcon,
} from "@halonicjs/studio-kit";
import { type ReactNode, type Ref, useId } from "react";
import type { PickModel } from "../pick-model/pick-model.ts";
import type { LocalState, PickModelState } from "../pick-model/pick-model-state.ts";
import {
  getKeyLink,
  keyPages,
  keySavedLine,
  localLine,
  localUseLine,
  pickModelWords as words,
} from "../pick-model/pick-model-words.ts";

/** A card's edge: `primary` while it is ticked, dashed while it is off (8e.5). */
const cardClasses = {
  ticked: "rounded-md border border-primary bg-surface",
  open: "rounded-md border border-border bg-surface",
  off: "rounded-md border border-dashed border-border bg-surface",
} as const;

const titleClasses = "text-body font-medium text-fg";
const noteClasses = "text-small text-fg-muted";

/** One option that can be ticked: a native radio in its card, and its body under it while ticked. */
export function OptionCard(props: {
  readonly name: string;
  readonly ticked: boolean;
  readonly title: string;
  readonly note: ReactNode;
  readonly onTick: () => void;
  readonly children?: ReactNode;
}) {
  return (
    <div className={props.ticked ? cardClasses.ticked : cardClasses.open}>
      <label className="flex cursor-pointer items-start gap-3 px-4 pt-3 pb-3">
        <input
          type="radio"
          name={props.name}
          checked={props.ticked}
          onChange={props.onTick}
          className="mt-1 size-4 shrink-0 accent-primary focus-ring"
        />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={titleClasses}>{props.title}</span>
          <span className={noteClasses}>{props.note}</span>
        </span>
      </label>
      {props.ticked && props.children !== undefined && (
        <div className="flex flex-col gap-3 pr-4 pb-4 pl-11">{props.children}</div>
      )}
    </div>
  );
}

/**
 * An option that can't be used here (HAL-14799): dashed, with no radio, so it isn't a control
 * and the group counts only the options that are. Its line says why, at full contrast.
 */
export function OffOption({
  title,
  note,
  why,
}: {
  readonly title: string;
  readonly note?: string;
  readonly why: string;
}) {
  return (
    <div className={`${cardClasses.off} flex flex-col gap-0.5 px-4 py-3 pl-11`}>
      <span className={titleClasses}>{title}</span>
      {note !== undefined && <span className={noteClasses}>{note}</span>}
      <StateLine icon={<InfoIcon />} tone="text-fg-muted">
        {why}
      </StateLine>
    </div>
  );
}

/** A state line with its icon: the tick when found, the warning when Ollama has no model. */
function StateLine({
  icon,
  tone,
  children,
}: {
  readonly icon: ReactNode;
  readonly tone: string;
  readonly children: ReactNode;
}) {
  return (
    <span className={`flex items-center gap-1.5 text-small ${tone}`}>
      <span className="size-icon-sm shrink-0 *:size-full" aria-hidden="true">
        {icon}
      </span>
      {children}
    </span>
  );
}

/** The local option's state line, by what the detection found. */
export function LocalStateLine({ local }: { readonly local: LocalState }) {
  if (local.kind === "one" || local.kind === "several") {
    return (
      <StateLine icon={<TickIcon />} tone="text-success">
        {localLine(local)}
      </StateLine>
    );
  }
  if (local.kind === "none-downloaded") {
    return (
      <StateLine icon={<WarningIcon />} tone="text-warning">
        {localLine(local)}
      </StateLine>
    );
  }
  return (
    <StateLine icon={<InfoIcon />} tone="text-fg-muted">
      {localLine(local)}
    </StateLine>
  );
}

/** The ticked local option's body: the model picker, the command, or what to do, and the test's wait. */
export function LocalBody({
  pick,
  state,
}: {
  readonly pick: PickModel;
  readonly state: PickModelState;
}) {
  const { local, localModel, busy } = state;
  return (
    <>
      {local.kind === "several" && localModel !== undefined && (
        <Field label={words.model}>
          <Select
            options={local.models.map((model) => ({ value: model, label: model }))}
            value={localModel}
            onChange={(model) => pick.chooseLocalModel(model)}
          />
        </Field>
      )}
      {local.kind === "none-downloaded" && (
        <>
          <p className="text-small text-fg">{words.pullHint}</p>
          <CommandBox command={words.pullCommand} />
        </>
      )}
      {local.kind === "not-found" && <p className="text-small text-fg">{words.startHint}</p>}
      {busy?.kind === "loading-local" && <LoadingNote slow={busy.slow} />}
      {localModel !== undefined && <p className={noteClasses}>{localUseLine(localModel)}</p>}
    </>
  );
}

/** "The first time can take a minute.", and amber with "Still loading…" after 30 s. */
function LoadingNote({ slow }: { readonly slow: boolean }) {
  if (!slow) {
    return (
      <Callout tone="info" icon={<Spinner />}>
        {words.loadingHint}
      </Callout>
    );
  }
  return (
    <Callout tone="warning" icon={<Spinner />} announce="polite">
      {words.loadingHint} {words.slowHint}
    </Callout>
  );
}

/** The ticked key option's body: the provider switch, the key field or the saved key, and the links. */
export function KeyBody(props: {
  readonly pick: PickModel;
  readonly state: PickModelState;
  readonly keyField: Ref<HTMLInputElement>;
}) {
  const { pick, state } = props;
  const saved = state.keySaved.has(state.provider) && !state.replacing;
  return (
    <>
      <ProviderSwitch
        provider={state.provider}
        locked={state.busy !== undefined}
        onChoose={(provider) => pick.chooseProvider(provider)}
      />
      {saved ? (
        <p className="flex flex-wrap items-center gap-2 text-small text-fg">
          {keySavedLine(state.provider)}
          <span aria-hidden="true">·</span>
          <button
            type="button"
            className="text-accent-text underline focus-ring"
            onClick={() => pick.replaceKey()}
          >
            {words.replace}
          </button>
        </p>
      ) : (
        <Field label={words.keyField} hint={words.keyKept}>
          <Input
            ref={props.keyField}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={words.keyPlaceholder}
            disabled={state.busy?.kind === "testing-key"}
            mono
          />
        </Field>
      )}
      <p className="text-small text-fg">
        {words.noKey}{" "}
        <ExternalLink href={keyPages[state.provider]}>{getKeyLink(state.provider)}</ExternalLink>{" "}
        <span className="text-fg-muted">{words.needsAccount}</span>
      </p>
      <p className={noteClasses}>{words.cost}</p>
    </>
  );
}

/** The provider as a three-way switch (8b.9): native radios drawn as one segmented track. */
function ProviderSwitch(props: {
  readonly provider: FirstRunKeyProvider;
  readonly locked: boolean;
  readonly onChoose: (provider: FirstRunKeyProvider) => void;
}) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-1">
      <span className="text-small font-medium text-fg" id={labelId}>
        {words.provider}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="inline-flex w-fit rounded-md bg-surface-muted p-0.5"
      >
        {firstRunKeyProviders.map((provider) => (
          <label key={provider} className="relative">
            <input
              type="radio"
              name="pick-model-provider"
              checked={props.provider === provider}
              disabled={props.locked}
              onChange={() => props.onChoose(provider)}
              className="peer sr-only"
            />
            <span className="block cursor-pointer rounded-sm px-3 py-1 text-small text-fg-muted peer-checked:bg-surface peer-checked:text-fg peer-focus-visible:focus-ring">
              {firstRunProviders[provider].name}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
