import type { HostSettings } from "@halonicjs/app";
import type { HostSettingValue } from "@halonicjs/ports";
import {
  Callout,
  Field,
  inlineLinkClasses,
  Select,
  Switch,
  ViewOnlyLine,
} from "@halonicjs/studio-kit";
import { type SettingsPlace, type SettingsSectionProps, ShellError } from "@halonicjs/studio-shell";
import { useState, useSyncExternalStore } from "react";
import {
  type AssistantWorkspace,
  type AssistantWorkspaceFacts,
  AssistantWorkspaceService,
  HostSettingsService,
} from "../api.ts";
import { checkModel, checkTurnLimit } from "./assistant-checks.ts";
import { assistantPrefs, turnLimitRange } from "./assistant-prefs.ts";
import {
  type AssistantProvider,
  assistantProviders,
  pickProvider,
  providerDefaults,
} from "./assistant-providers.ts";
import * as text from "./assistant-text.ts";
import { HowItConnects } from "./how-it-connects.tsx";
import { KeyLine } from "./key-line.tsx";
import { SavedTextField } from "./saved-text-field.tsx";
import { Tuning } from "./tuning.tsx";
import { type ShownHostSetting, useHostSetting } from "./use-host-setting.ts";

const providerOptions = assistantProviders.map((provider) => ({
  value: provider,
  label: providerDefaults[provider].label,
}));

/** Settings → Assistant as the settings container shows it. */
export function AssistantSection({ context, closeSettings, place }: SettingsSectionProps) {
  const settings = context.services.get(HostSettingsService);
  const loaded = useLoaded(settings);
  if (!loaded.ready) return <NotLoaded onTryAgain={loaded.tryAgain} />;
  return (
    <AssistantView
      settings={settings}
      announce={(line) => context.announcer.announce(line)}
      place={place}
      workspace={workspaceOf(context)}
      closeSettings={closeSettings}
    />
  );
}

/** Whether the host settings are loaded, and a way to load them again when they aren't. */
function useLoaded(settings: HostSettings) {
  const [, redraw] = useState(0);
  return {
    ready: settings.loaded,
    tryAgain: () =>
      settings.load().then(
        () => redraw((count) => count + 1),
        (error: unknown) => console.error(error),
      ),
  };
}

/** What the section says when the host settings couldn't be read (`settings.ai-agent-section`). */
function NotLoaded({ onTryAgain }: { readonly onTryAgain: () => void }) {
  return (
    <div className="mt-5 flex max-w-90 flex-col gap-4">
      <Callout tone="warning" action={{ label: text.TRY_AGAIN, onClick: onTryAgain }}>
        {text.NOT_LOADED}
      </Callout>
    </div>
  );
}

/** The props of {@link AssistantView}. */
export interface AssistantViewProps {
  /** The host settings, already loaded. */
  readonly settings: HostSettings;
  /** Says a failed save in the dialog: the settings container's live region. */
  readonly announce: (line: string) => void;
  readonly place: SettingsPlace;
  /** The open workspace, when the app gives one: the key line, the warning and the "sets its own" line need it. */
  readonly workspace?: AssistantWorkspace | undefined;
  /** Closes Settings before a link opens a page. */
  readonly closeSettings?: () => void;
}

/** The app's workspace for the Assistant, or none when the window gives none. */
function workspaceOf(context: SettingsSectionProps["context"]): AssistantWorkspace | undefined {
  try {
    return context.services.get(AssistantWorkspaceService);
  } catch (error) {
    // Only "the feature doesn't list it" means no workspace; anything else is a bug to surface.
    if (error instanceof ShellError) return undefined;
    throw error;
  }
}

const noWorkspace = () => () => {};
const noFacts = () => null;

/** The open workspace's facts, drawn again when they change. */
function useOpenWorkspace(
  workspace: AssistantWorkspace | undefined,
): AssistantWorkspaceFacts | null {
  return useSyncExternalStore(
    workspace === undefined ? noWorkspace : (listener) => workspace.subscribe(listener),
    workspace === undefined ? noFacts : () => workspace.current(),
  );
}

/**
 * Settings → Assistant (flow-settings 7): the Provider, Model, Turn limit, Connector tools and
 * Instructions of the assistant used for new chats in every workspace on this computer, each saved
 * by itself. A pick or switch that fails to save goes back and says so under the control and in
 * the dialog; a typed value stays in its field (`settings.ai-agent-section`).
 *
 * @example
 * <AssistantView settings={hostSettings} announce={say} place="app" />
 */
export function AssistantView(props: AssistantViewProps) {
  if (props.place === "served") return <AssistantViewOnly {...props} />;
  return <AssistantEditor {...props} />;
}

/** The line under the warning when the open workspace sets its own model, with its link unless served. */
function SetsItsOwn({
  open,
  link,
}: {
  readonly open: AssistantWorkspaceFacts | null;
  readonly link: (() => void) | null;
}) {
  if (open === null || open.sessionModel === null) return null;
  return (
    <p className="text-small fg-muted">
      {text.setsItsOwn(open.name, open.sessionModel)}
      {link === null ? null : (
        <>
          {" "}
          <button type="button" className={inlineLinkClasses} onClick={link}>
            {text.WORKSPACE_SETTINGS}
          </button>
        </>
      )}
    </p>
  );
}

/** A tuning setting for {@link Tuning}: an empty value puts the setting back to its default. */
function tuned<Value extends HostSettingValue>(
  shown: ShownHostSetting<Value>,
  isEmpty: (value: Value) => boolean,
) {
  return {
    value: shown.value,
    failed: shown.failed,
    save: (value: Value) => shown.save(isEmpty(value) ? undefined : value),
  };
}

function ServedKey(props: {
  readonly provider: AssistantProvider;
  readonly secretName: string;
  readonly workspace: AssistantWorkspace | undefined;
  readonly open: AssistantWorkspaceFacts | null;
}) {
  const { provider, ...rest } = props;
  if (provider === "not-set-up") return null;
  return <KeyLine provider={provider} closeSettings={() => {}} served {...rest} />;
}

/** The label-over-value rows of the section served to another device. */
function AssistantViewOnly({ settings, workspace }: AssistantViewProps) {
  const open = useOpenWorkspace(workspace);
  const provider = useHostSetting(settings, assistantPrefs.provider).value;
  const model = useHostSetting(settings, assistantPrefs.model).value;
  const baseUrl = useHostSetting(settings, assistantPrefs.baseUrl).value;
  const secretName = useHostSetting(settings, assistantPrefs.secretName).value;
  const local = useHostSetting(settings, assistantPrefs.local).value;
  const turnLimit = useHostSetting(settings, assistantPrefs.turnLimit).value;
  const connectorTools = useHostSetting(settings, assistantPrefs.connectorTools).value;
  const instructions = useHostSetting(settings, assistantPrefs.instructions).value;
  const temperature = useHostSetting(settings, assistantPrefs.temperature).value;
  const topP = useHostSetting(settings, assistantPrefs.topP).value;
  const maxTokens = useHostSetting(settings, assistantPrefs.maxTokens).value;
  const stop = useHostSetting(settings, assistantPrefs.stop).value;
  const reasoningEffort = useHostSetting(settings, assistantPrefs.reasoningEffort).value;
  const orNone = (value: string) => (value === "" ? text.NOTHING : value);
  const rows: Array<[string, string]> = [[text.PROVIDER, providerDefaults[provider].label]];
  if (provider !== "not-set-up") {
    rows.push(
      [text.MODEL, orNone(model)],
      [text.BASE_URL, orNone(baseUrl)],
      [text.SECRET_NAME, orNone(secretName)],
      [text.LOCAL, local ? text.ON : text.OFF],
      [text.TEMPERATURE, temperature === null ? text.PROVIDER_DEFAULT : String(temperature)],
      [text.TOP_P, topP === null ? text.PROVIDER_DEFAULT : String(topP)],
      [text.MAX_TOKENS, maxTokens === null ? text.PROVIDER_DEFAULT : String(maxTokens)],
      [text.STOP, stop.length === 0 ? text.PROVIDER_DEFAULT : stop.join(", ")],
      [text.REASONING_EFFORT, reasoningEffort === "" ? text.PROVIDER_DEFAULT : reasoningEffort],
    );
  }
  rows.push(
    [text.TURN_LIMIT, String(turnLimit)],
    [text.CONNECTOR_TOOLS, connectorTools ? text.ON : text.OFF],
    [text.INSTRUCTIONS, orNone(instructions)],
  );
  return (
    <div className="mt-5 flex max-w-90 flex-col gap-4">
      <p className="text-body fg-muted">{text.FIRST_LINE.served}</p>
      <ViewOnlyLine>{text.VIEW_ONLY_LINE}</ViewOnlyLine>
      <SetsItsOwn open={open} link={null} />
      <dl className="flex flex-col gap-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-small fg-muted">{label}</dt>
            <dd className="text-body">{value}</dd>
          </div>
        ))}
      </dl>
      <ServedKey provider={provider} secretName={secretName} workspace={workspace} open={open} />
    </div>
  );
}

function AssistantEditor({
  settings,
  announce,
  place,
  workspace,
  closeSettings,
}: AssistantViewProps) {
  const open = useOpenWorkspace(workspace);
  const provider = useHostSetting(settings, assistantPrefs.provider);
  const model = useHostSetting(settings, assistantPrefs.model);
  const baseUrl = useHostSetting(settings, assistantPrefs.baseUrl);
  const secretName = useHostSetting(settings, assistantPrefs.secretName);
  const local = useHostSetting(settings, assistantPrefs.local);
  const turnLimit = useHostSetting(settings, assistantPrefs.turnLimit);
  const connectorTools = useHostSetting(settings, assistantPrefs.connectorTools);
  const instructions = useHostSetting(settings, assistantPrefs.instructions);
  const temperature = useHostSetting(settings, assistantPrefs.temperature);
  const topP = useHostSetting(settings, assistantPrefs.topP);
  const maxTokens = useHostSetting(settings, assistantPrefs.maxTokens);
  const stop = useHostSetting(settings, assistantPrefs.stop);
  const reasoningEffort = useHostSetting(settings, assistantPrefs.reasoningEffort);

  const [focusBaseUrl, setFocusBaseUrl] = useState(false);
  const failedLine = (what: string, failed: boolean) => (failed ? text.notSaved(what) : null);

  async function pick(picked: string) {
    const to = assistantProviders.find((name) => name === picked);
    if (to === undefined) return;
    const from = provider.value;
    const fields = pickProvider(
      { baseUrl: baseUrl.value, secretName: secretName.value, local: local.value },
      from,
      to,
    );
    // The provider goes last, so a failure never leaves it next to the old provider's fields.
    const written: Array<() => Promise<boolean>> = [];
    const write = async <Value extends string | boolean>(
      shown: { value: Value; save: (value: Value | undefined) => Promise<boolean> },
      next: Value | undefined,
    ) => {
      const before = shown.value;
      if (!(await shown.save(next))) return false;
      written.push(() => shown.save(before));
      return true;
    };
    const saved =
      (await write(baseUrl, fields.baseUrl)) &&
      (await write(secretName, fields.secretName)) &&
      (await write(local, fields.local)) &&
      (await provider.save(to));
    setFocusBaseUrl(saved && to === "openai-compatible");
    if (!saved) {
      for (const undo of written.reverse()) await undo();
      provider.markFailed();
    }
    if (!saved) {
      announce(
        `${text.notSaved("the provider")} Provider is back to ${providerDefaults[from].label}.`,
      );
    }
  }

  async function saveTyped<Value extends string | number | boolean>(
    what: string,
    shown: { save: (value: Value | undefined) => Promise<boolean> },
    value: Value | undefined,
  ) {
    const saved = await shown.save(value);
    if (!saved) announce(text.notSaved(what));
    return saved;
  }

  async function toggleConnectorTools(on: boolean) {
    if (!(await connectorTools.save(on))) {
      announce(
        `${text.notSaved("connector tools")} Connector tools are back ${connectorTools.value ? "on" : "off"}.`,
      );
    }
  }

  async function toggleLocal(on: boolean) {
    if (!(await local.save(on))) {
      announce(`${text.notSaved("Local")} Local is back ${local.value ? "on" : "off"}.`);
    }
  }

  const chosen: AssistantProvider = provider.value;
  const turnLimitText = turnLimit.value === turnLimitRange.fallback ? "" : String(turnLimit.value);
  return (
    <div className="mt-5 flex max-w-90 flex-col gap-4">
      <p className="text-body fg-muted">{text.FIRST_LINE[place]}</p>
      {chosen !== "not-set-up" && open?.localOnly && !local.value ? (
        <Callout tone="warning">{text.localOnlyWarning(open.name)}</Callout>
      ) : null}
      {open === null || workspace === undefined ? null : (
        <SetsItsOwn
          open={open}
          link={() => {
            closeSettings?.();
            workspace.openSessionAi();
          }}
        />
      )}
      <h4 className="text-body-strong">{text.MODEL_GROUP}</h4>
      <Field
        label={text.PROVIDER}
        hint={chosen === "not-set-up" ? text.NOT_SET_UP_LINE : undefined}
        error={failedLine("the provider", provider.failed)}
      >
        <Select options={providerOptions} value={chosen} onChange={pick} />
      </Field>
      <SavedTextField
        label={text.MODEL}
        placeholder={providerDefaults[chosen].modelPlaceholder}
        stored={model.value}
        check={(typed) => checkModel(chosen, typed)}
        save={(value) => saveTyped("the model", model, value)}
        saveError={failedLine("the model", model.failed)}
      />
      {chosen === "not-set-up" ? null : (
        <KeyLine
          provider={chosen}
          secretName={secretName.value}
          workspace={workspace}
          open={open}
          closeSettings={closeSettings ?? (() => {})}
        />
      )}
      {chosen === "not-set-up" ? null : (
        <HowItConnects
          provider={chosen}
          baseUrl={baseUrl.value}
          secretName={secretName.value}
          local={local.value}
          baseUrlFailed={baseUrl.failed}
          secretNameFailed={secretName.failed}
          localFailed={local.failed}
          saveBaseUrl={(value) => saveTyped("the Base URL", baseUrl, value)}
          saveSecretName={(value) => saveTyped("the secret name", secretName, value)}
          toggleLocal={toggleLocal}
          focusBaseUrl={focusBaseUrl}
        />
      )}
      {chosen === "not-set-up" ? null : (
        <Tuning
          temperature={tuned(temperature, (value) => value === null)}
          topP={tuned(topP, (value) => value === null)}
          maxTokens={tuned(maxTokens, (value) => value === null)}
          stop={tuned(stop, (value) => value.length === 0)}
          reasoningEffort={tuned(reasoningEffort, (value) => value === "")}
          saveTyped={async (what, save) => {
            const saved = await save();
            if (!saved) announce(text.notSaved(what));
            return saved;
          }}
        />
      )}
      <h4 className="text-body-strong">{text.ANSWERS_GROUP}</h4>
      <SavedTextField
        label={text.TURN_LIMIT}
        hint={text.TURN_LIMIT_HINT}
        placeholder={String(turnLimitRange.fallback)}
        stored={turnLimitText}
        check={checkTurnLimit}
        save={(value) => saveTyped("the turn limit", turnLimit, value)}
        saveError={failedLine("the turn limit", turnLimit.failed)}
      />
      <Field
        label={text.CONNECTOR_TOOLS}
        error={failedLine("connector tools", connectorTools.failed)}
      >
        <Switch checked={connectorTools.value} onChange={toggleConnectorTools}>
          {text.CONNECTOR_TOOLS_SENTENCE}
        </Switch>
      </Field>
      <SavedTextField
        multiline
        label={text.INSTRUCTIONS}
        placeholder={text.INSTRUCTIONS_PLACEHOLDER}
        stored={instructions.value}
        check={(typed) => ({ ok: true, value: typed })}
        save={(value) => saveTyped("the instructions", instructions, value)}
        saveError={failedLine("the instructions", instructions.failed)}
      />
    </div>
  );
}
