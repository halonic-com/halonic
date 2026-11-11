import type { Plugin, PluginSettingField, PluginSettingValue } from "@halonicjs/format";
import { EmptyState, Field, Input, Select, StatusChip, Switch } from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import {
  type PluginSecretWriter,
  type PluginSettingProblem,
  type PluginSettingsHost,
  savePluginSettings,
} from "./plugin-secrets.ts";
import {
  hostFromSetting,
  SECRET_NOT_SET,
  SECRET_SET,
  SETTINGS_HEADING,
  SETTINGS_NOT_LOADED,
  secretNotSavedLine,
  secretStoredLine,
  settingNotSavedLine,
  settingProblemLine,
  TRY_AGAIN,
} from "./settings-text.ts";

/** The part of `PluginService` the section reads and saves through. */
export interface PluginSettingsReader extends PluginSettingsHost {
  /** The saved value of each setting, or its default. Secrets aren't in it. */
  settings(plugin: Plugin): Promise<Readonly<Record<string, PluginSettingValue>>>;
}

/**
 * The keychain, as the section uses it: the writer, and `get` to tell
 * "Set" from "Not set". `TauriSecrets` has this shape. The section never
 * keeps or shows a value it reads.
 */
export interface PluginSecretStore extends PluginSecretWriter {
  get(name: string): Promise<string | null>;
}

/** Where the page's toolbar is: "Saving…", then "✓ Saved" or "Couldn't save". */
export type SettingsSaveState = "saving" | "saved" | "failed";

/** The props of `PluginSettingsSection`. */
export interface PluginSettingsSectionProps {
  readonly plugin: Plugin;
  readonly host: PluginSettingsReader;
  readonly secrets: PluginSecretStore;
  /**
   * The plugin is off (not trusted yet, changed, can't load). The fields
   * stay readable and use the kit's unavailable state; `reason` is the `id`
   * of the page's status box, which says why.
   */
  readonly off?: { readonly reason: string } | undefined;
  /** Each save's progress, for the page's toolbar save note. */
  readonly onSaveState?: (state: SettingsSaveState) => void;
}

type Values = Readonly<Record<string, PluginSettingValue>>;

/**
 * A plugin's settings on its page, from `ui.settings`: label-over-field
 * rows, each saved when you leave it, a switch or a pick at once. A secret
 * shows "Set" or "Not set" and goes to the keychain under the plugin's own
 * name. Every label and help line is the plugin's, shown as plain text.
 *
 * @example
 * <PluginSettingsSection plugin={weather} host={pluginService} secrets={keychain}
 *   onSaveState={setSaveNote} />
 */
export function PluginSettingsSection({
  plugin,
  host,
  secrets,
  off,
  onSaveState,
}: PluginSettingsSectionProps) {
  const headingId = useId();
  const fields = Object.entries(plugin.ui?.settings ?? {});
  const [values, setValues] = useState<Values | undefined>(undefined);
  const [secretSet, setSecretSet] = useState<Readonly<Record<string, boolean>>>({});
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  // The values the host holds now: a refused or failed save doesn't change them.
  const saved = useRef<Values>({});
  // Saves run one at a time: the host replaces the whole record, so each
  // builds it from `saved` only once the one before has finished.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let current = true;
    void (async () => {
      try {
        const loaded = await host.settings(plugin);
        const set = await secretsSet(host, secrets, plugin);
        if (!current) return;
        saved.current = loaded;
        setValues(loaded);
        setSecretSet(set);
        setLoadError(undefined);
      } catch (error) {
        if (current) setLoadError(settingProblemLine(reasonOf(error)));
      }
    })();
    return () => {
      current = false;
    };
  }, [host, secrets, plugin, attempt]);

  if (fields.length === 0) return null;
  if (loadError !== undefined) {
    return (
      <EmptyState
        tone="error"
        align="start"
        headingLevel={2}
        title={SETTINGS_NOT_LOADED}
        description={loadError}
        action={{ label: TRY_AGAIN, onClick: () => setAttempt((count) => count + 1) }}
      />
    );
  }
  if (values === undefined) return null;

  /**
   * Saves `setting`'s new value with every other saved one, because the
   * host keeps a plugin's values as one record, after any save still going.
   * Returns whether it saved.
   */
  function save(
    setting: string,
    value: PluginSettingValue | undefined,
    secret?: string,
  ): Promise<boolean> {
    const done = queue.current.then(() => saveNow(setting, value, secret));
    queue.current = done.catch(() => undefined);
    return done;
  }

  async function saveNow(setting: string, value: PluginSettingValue | undefined, secret?: string) {
    if (secret === undefined && value === saved.current[setting]) {
      setErrors((now) => without(now, setting));
      return true;
    }
    const next: Record<string, unknown> = { ...saved.current, [setting]: value };
    if (secret !== undefined) {
      next[setting] = secret;
    }
    onSaveState?.("saving");
    try {
      const outcome = await savePluginSettings(host, secrets, plugin, next);
      if (outcome.kind === "refused") {
        setErrors(problemLines(outcome.problems));
        onSaveState?.("failed");
        return false;
      }
      if (secret === undefined) {
        saved.current = withValue(saved.current, setting, value);
      }
      const failure = outcome.failed[0];
      if (failure !== undefined) {
        const line = secretNotSavedLine(reasonOf(failure.error), secretSet[setting] === true);
        setErrors((now) => ({ ...now, [setting]: line }));
        onSaveState?.("failed");
        return false;
      }
      // Only this field's error goes: another field's unsaved text keeps its own.
      setErrors((now) => without(now, setting));
      onSaveState?.("saved");
      return true;
    } catch (error) {
      const label = plugin.ui?.settings[setting]?.label ?? setting;
      const line = settingNotSavedLine(label, reasonOf(error));
      setErrors((now) => ({ ...now, [setting]: line }));
      onSaveState?.("failed");
      return false;
    }
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="text-heading text-fg">
        {SETTINGS_HEADING}
      </h2>
      {fields.map(([setting, field]) => {
        const row = { plugin, field, error: errors[setting] ?? null, off };
        if (field.type === "secret") {
          return (
            <SecretRow
              key={setting}
              {...row}
              field={field}
              isSet={secretSet[setting] === true}
              onSave={async (secret) => {
                const ok = await save(setting, undefined, secret);
                if (ok) setSecretSet((now) => ({ ...now, [setting]: true }));
                return ok;
              }}
            />
          );
        }
        return (
          <SettingRow
            key={setting}
            {...row}
            field={field}
            value={values[setting]}
            onSave={async (value) => {
              if (off !== undefined) return;
              setValues((now) => withValue(now ?? {}, setting, value));
              // A pick or a switch goes back when it couldn't be saved; typed text stays.
              if (!(await save(setting, value)) && typeof value !== "string") {
                setValues((now) => withValue(now ?? {}, setting, saved.current[setting]));
              }
            }}
          />
        );
      })}
    </section>
  );
}

type InputField = Exclude<PluginSettingField, { type: "secret" }>;
type SecretField = Extract<PluginSettingField, { type: "secret" }>;

interface RowProps {
  readonly plugin: Plugin;
  readonly error: string | null;
  readonly off: { readonly reason: string } | undefined;
}

interface SettingRowProps extends RowProps {
  readonly field: InputField;
  readonly value: PluginSettingValue | undefined;
  /** A typed value that isn't a number yet goes as text, so the host says what to use. */
  readonly onSave: (value: PluginSettingValue | undefined) => Promise<void>;
}

/** One setting: the kit part for its type, inside a Field with the plugin's label. */
function SettingRow({ field, value, error, off, onSave }: SettingRowProps) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  const hint = field.help;
  // Kit gap: `Field` sets `aria-describedby`, so an Input or a Select can't
  // point at `off.reason` the way the Switch does.
  const unavailable = off === undefined ? {} : { readOnly: true, "aria-disabled": true };

  switch (field.type) {
    case "boolean":
      return (
        <Field label={field.label} hint={hint} error={error}>
          <Switch
            label={field.label}
            checked={value === true}
            unavailable={off}
            onChange={(checked) => void onSave(checked)}
          />
        </Field>
      );
    case "choice":
      return (
        <Field label={field.label} hint={hint} error={error}>
          <Select
            options={field.choices.map((choice) => ({ value: choice, label: choice }))}
            value={typeof value === "string" ? value : ""}
            disabled={off !== undefined}
            onChange={(picked) => void onSave(picked)}
          />
        </Field>
      );
    case "number":
    case "text":
    case "url":
      return (
        <Field label={field.label} hint={hint} error={error} required={field.required}>
          <Input
            type={field.type === "url" ? "url" : "text"}
            inputMode={field.type === "number" ? "decimal" : undefined}
            {...unavailable}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => void onSave(typed(field, draft))}
          />
        </Field>
      );
  }
}

interface SecretRowProps extends RowProps {
  readonly field: SecretField;
  readonly isSet: boolean;
  /** Returns whether it was saved, so the entry empties only then. */
  readonly onSave: (secret: string) => Promise<boolean>;
}

/**
 * A secret: its state, an entry that never shows what's stored, and where
 * it goes. Leaving the entry empty keeps what's stored.
 */
function SecretRow({ plugin, field, isSet, error, off, onSave }: SecretRowProps) {
  const [draft, setDraft] = useState("");
  const hint: ReactNode = (
    <>
      <StatusChip tone={isSet ? "neutral" : "warning"}>
        {isSet ? SECRET_SET : SECRET_NOT_SET}
      </StatusChip>{" "}
      {field.help === undefined ? null : <span className="block">{field.help}</span>}
      <span className="block">
        {secretStoredLine(field.secret, secretHosts(plugin, field.secret))}
      </span>
    </>
  );
  const unavailable = off === undefined ? {} : { readOnly: true, "aria-disabled": true };
  return (
    <Field label={field.label} hint={hint} error={error}>
      <Input
        type="password"
        autoComplete="off"
        spellCheck={false}
        {...unavailable}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={async () => {
          if (draft === "" || off !== undefined) return;
          if (await onSave(draft)) setDraft("");
        }}
      />
    </Field>
  );
}

/**
 * Where a secret may go, from the plugin's backend or local tool that
 * declares it, joined for a sentence: "api.example.com and api.acme.com".
 */
export function secretHosts(plugin: Plugin, secret: string): string {
  const declared = [
    plugin.backend?.secrets,
    ...(plugin.localTools ?? []).map((tool) => tool.secrets),
  ];
  const hosts = new Set<string>();
  for (const secrets of declared) {
    if (secrets === undefined || !Object.hasOwn(secrets, secret)) continue;
    for (const host of secrets[secret]?.hosts ?? []) {
      if (typeof host === "string") {
        hosts.add(host);
      } else {
        const field = plugin.ui?.settings[host.fromSetting];
        hosts.add(hostFromSetting(field?.label ?? host.fromSetting));
      }
    }
  }
  return new Intl.ListFormat("en", { type: "conjunction" }).format([...hosts]);
}

/**
 * Whether each secret setting has a value in the keychain. One the keychain
 * can't read counts as not set; the value itself is dropped at once.
 */
async function secretsSet(
  host: PluginSettingsReader,
  secrets: PluginSecretStore,
  plugin: Plugin,
): Promise<Record<string, boolean>> {
  const names = host.secretNames(plugin);
  const set: Record<string, boolean> = {};
  for (const [setting, field] of Object.entries(plugin.ui?.settings ?? {})) {
    if (field.type !== "secret") continue;
    const name = names[field.secret];
    set[setting] = name !== undefined && (await secrets.get(name).catch(() => null)) !== null;
  }
  return set;
}

function problemLines(problems: readonly PluginSettingProblem[]): Record<string, string> {
  const lines: Record<string, string> = {};
  for (const problem of problems) {
    lines[problem.setting] ??= settingProblemLine(problem.message);
  }
  return lines;
}

function withValue(values: Values, setting: string, value: PluginSettingValue | undefined): Values {
  const next: Record<string, PluginSettingValue> = { ...values };
  if (value === undefined) {
    delete next[setting];
  } else {
    next[setting] = value;
  }
  return next;
}

function without(lines: Readonly<Record<string, string>>, setting: string) {
  if (!Object.hasOwn(lines, setting)) return lines;
  const { [setting]: _, ...rest } = lines;
  return rest;
}

/**
 * What was typed, as the setting's value: empty is "not set", and a number
 * setting gets a number when the text is one.
 */
function typed(field: InputField, text: string): PluginSettingValue | undefined {
  if (text === "") return undefined;
  if (field.type !== "number") return text;
  const number = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(number) ? number : text;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
