import type { HostSettings } from "@halonicjs/app";
import { Field, Select, Switch } from "@halonicjs/studio-kit";
import type { SettingsPlace, SettingsSectionProps } from "@halonicjs/studio-shell";
import { HostSettingsService } from "../api.ts";
import { checkModel, checkTurnLimit } from "./assistant-checks.ts";
import { assistantPrefs, turnLimitRange } from "./assistant-prefs.ts";
import {
  type AssistantProvider,
  assistantProviders,
  pickProvider,
  providerDefaults,
} from "./assistant-providers.ts";
import * as text from "./assistant-text.ts";
import { SavedTextField } from "./saved-text-field.tsx";
import { useHostSetting } from "./use-host-setting.ts";

const providerOptions = assistantProviders.map((provider) => ({
  value: provider,
  label: providerDefaults[provider].label,
}));

/** Settings → Assistant as the settings container shows it. */
export function AssistantSection({ context, place }: SettingsSectionProps) {
  return (
    <AssistantView
      settings={context.services.get(HostSettingsService)}
      announce={(line) => context.announcer.announce(line)}
      place={place}
    />
  );
}

/** The props of {@link AssistantView}. */
export interface AssistantViewProps {
  /** The host settings, already loaded. */
  readonly settings: HostSettings;
  /** Says a failed save in the dialog: the settings container's live region. */
  readonly announce: (line: string) => void;
  readonly place: SettingsPlace;
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
export function AssistantView({ settings, announce, place }: AssistantViewProps) {
  const provider = useHostSetting(settings, assistantPrefs.provider);
  const model = useHostSetting(settings, assistantPrefs.model);
  const baseUrl = useHostSetting(settings, assistantPrefs.baseUrl);
  const secretName = useHostSetting(settings, assistantPrefs.secretName);
  const local = useHostSetting(settings, assistantPrefs.local);
  const turnLimit = useHostSetting(settings, assistantPrefs.turnLimit);
  const connectorTools = useHostSetting(settings, assistantPrefs.connectorTools);
  const instructions = useHostSetting(settings, assistantPrefs.instructions);

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

  const chosen: AssistantProvider = provider.value;
  const turnLimitText = turnLimit.value === turnLimitRange.fallback ? "" : String(turnLimit.value);
  return (
    <div className="mt-5 flex max-w-90 flex-col gap-4">
      <p className="text-body fg-muted">{text.FIRST_LINE[place]}</p>
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
