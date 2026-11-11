import { type PluginSettingValue, type PluginUi, settingValueProblem } from "@halonicjs/format";
import { Checkbox, CopyButton, Dialog, Field, Input, Select } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef, useState } from "react";
import { settingProblemLine } from "../settings/settings-text.ts";
import { PluginResult } from "../ui/plugin-result.tsx";
import {
  CANCEL,
  CLOSE,
  COPY_RESULT,
  commandFailedLine,
  FILL_THIS_IN,
  fromPlugin,
  RESULT,
  RUN_AGAIN,
  RUN_COMMAND,
  RUNNING,
  TRY_AGAIN,
  USES_THE_TOOL,
  WHICH_READS,
} from "./command-text.ts";

/** One command from a plugin's `ui.commands`. */
export type PluginCommand = PluginUi["commands"][number];

type FormField = PluginCommand["form"][string];

/** A command's arguments: one per filled-in form field, by its tool argument's name. */
export type PluginCommandArgs = Readonly<Record<string, PluginSettingValue>>;

/**
 * Calls one of a plugin's tools outside a run. Commands only name tools that
 * read (CHECK P4), so nothing here waits for a person.
 */
export interface PluginToolCaller {
  /**
   * @returns the tool's answer as text
   * @throws an Error whose message says why the call failed
   */
  call(plugin: string, tool: string, args: PluginCommandArgs): Promise<string>;
}

/** The props of `PluginCommandDialog`. */
export interface PluginCommandDialogProps {
  /** The plugin's id and its name, which is untrusted text. */
  readonly plugin: { readonly id: string; readonly name: string };
  readonly command: PluginCommand;
  readonly caller: PluginToolCaller;
  /** Cancel, Close, the ✕ and Escape. The screen unmounts the dialog. */
  readonly onClose: () => void;
}

type Run =
  | { readonly kind: "idle" }
  | { readonly kind: "running" }
  | { readonly kind: "done"; readonly text: string }
  | { readonly kind: "failed"; readonly reason: string };

/**
 * A plugin command's dialog (design 8.1, UX checklist 7): the command's
 * title, where it comes from and the tool it uses, its form, then
 * **Run command**. The answer shows in a Result box with Copy, and the
 * buttons become **Run again** and **Close**. A failure shows in the alert
 * slot with **Try again**, and the form keeps what was typed. A command
 * without a form runs as soon as the dialog opens. Every word that acts is
 * Halonic's; the plugin's title, labels and answer are plain text.
 *
 * @example
 * <PluginCommandDialog plugin={{ id: "weather", name: "Weather" }} command={forecast}
 *   caller={pluginTools} onClose={() => setOpen(undefined)} />
 */
export function PluginCommandDialog({
  plugin,
  command,
  caller,
  onClose,
}: PluginCommandDialogProps) {
  const fields = Object.entries(command.form);
  const [drafts, setDrafts] = useState<Readonly<Record<string, Draft>>>(() =>
    Object.fromEntries(fields.map(([name, field]) => [name, initialDraft(field)])),
  );
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [run, setRun] = useState<Run>({ kind: "idle" });
  const formRef = useRef<HTMLDivElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const resultHeadingId = useId();
  // The command whose call is current: a dialog that closed, or a later run, drops an older answer.
  const latest = useRef(0);

  async function start(args: PluginCommandArgs) {
    const attempt = ++latest.current;
    setRun({ kind: "running" });
    try {
      const text = await caller.call(plugin.id, command.tool, args);
      if (attempt === latest.current) setRun({ kind: "done", text });
    } catch (error) {
      if (attempt === latest.current) setRun({ kind: "failed", reason: reasonOf(error) });
    }
  }

  function submit() {
    if (run.kind === "running") return;
    const checked = checkForm(fields, drafts);
    setErrors(checked.errors);
    if (checked.args === undefined) {
      // Wait for the error lines to render, then focus the first field that has one (a11y A1).
      queueMicrotask(() =>
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    void start(checked.args);
  }

  // A command without a form runs as soon as it opens.
  const ranOnOpen = useRef(false);
  useEffect(() => {
    if (fields.length > 0 || ranOnOpen.current) return;
    ranOnOpen.current = true;
    void start({});
  });
  useEffect(() => () => void ++latest.current, []);
  useEffect(() => {
    if (run.kind === "done") resultHeading.current?.focus();
  }, [run]);

  return (
    <Dialog
      title={command.title}
      size="md"
      form={fields.length > 0}
      confirm={{ label: confirmLabels[run.kind], busyLabel: RUNNING }}
      busy={run.kind === "running"}
      {...(run.kind === "failed" ? { error: commandFailedLine(command.title, run.reason) } : {})}
      onConfirm={submit}
      cancelLabel={run.kind === "done" ? CLOSE : CANCEL}
      onCancel={onClose}
    >
      <div className="flex flex-col gap-4">
        <p className="text-small text-fg-muted wrap-anywhere">
          {fromPlugin(plugin.name)}
          {USES_THE_TOOL}
          <code className="font-mono">{command.tool}</code>
          {WHICH_READS}
        </p>
        {fields.length > 0 ? (
          <div ref={formRef} className="flex flex-col gap-4">
            {fields.map(([name, field]) => (
              <FormRow
                key={name}
                field={field}
                draft={drafts[name] ?? initialDraft(field)}
                error={errors[name]}
                onChange={(draft) => setDrafts((now) => ({ ...now, [name]: draft }))}
              />
            ))}
          </div>
        ) : null}
        {run.kind === "done" ? (
          <section
            aria-labelledby={resultHeadingId}
            className="flex flex-col gap-2 rounded-md border border-border p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3
                id={resultHeadingId}
                ref={resultHeading}
                tabIndex={-1}
                className="text-body-strong text-fg outline-none"
              >
                {RESULT}
              </h3>
              <CopyButton text={run.text} label={COPY_RESULT} />
            </div>
            <PluginResult text={run.text} show={command.show} />
          </section>
        ) : null}
      </div>
    </Dialog>
  );
}

/** The confirming button's words: never the command's own. */
const confirmLabels: Readonly<Record<Run["kind"], string>> = {
  idle: RUN_COMMAND,
  running: RUN_COMMAND,
  done: RUN_AGAIN,
  failed: TRY_AGAIN,
};

/** What's in a field now: text for an Input or a Select, a tick for a Checkbox. */
type Draft = string | boolean;

function initialDraft(field: FormField): Draft {
  if (field.type === "boolean") return field.default ?? false;
  return field.default === undefined ? "" : String(field.default);
}

/** One form field: the kit part for its type, with the plugin's label and help as plain text. */
function FormRow({
  field,
  draft,
  error,
  onChange,
}: {
  readonly field: FormField;
  readonly draft: Draft;
  readonly error: string | undefined;
  readonly onChange: (draft: Draft) => void;
}) {
  switch (field.type) {
    case "boolean":
      // Nothing happens until Run command, so a yes/no field is a Checkbox, not a Switch.
      // A tick always has a value, so it never has an error line.
      return (
        <div className="flex flex-col gap-1">
          <Checkbox checked={draft === true} onChange={onChange}>
            {field.label}
          </Checkbox>
          {field.help === undefined ? null : (
            <p className="ms-6 text-small text-fg-muted wrap-anywhere">{field.help}</p>
          )}
        </div>
      );
    case "choice":
      return (
        <Field
          label={field.label}
          hint={field.help}
          error={error ?? null}
          required={field.required}
        >
          <Select
            options={field.choices.map((choice) => ({ value: choice, label: choice }))}
            value={typeof draft === "string" ? draft : ""}
            onChange={onChange}
          />
        </Field>
      );
    case "number":
    case "text":
    case "url":
      return (
        <Field
          label={field.label}
          hint={field.help}
          error={error ?? null}
          required={field.required}
        >
          <Input
            type={field.type === "url" ? "url" : "text"}
            inputMode={field.type === "number" ? "decimal" : undefined}
            value={typeof draft === "string" ? draft : ""}
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      );
  }
}

/**
 * The tool's arguments from the form, or an error line for each field that
 * can't be sent: a required one left empty, or a value of the wrong kind,
 * by the rules a setting's value follows. An empty optional field is left out.
 */
function checkForm(
  fields: readonly (readonly [string, FormField])[],
  drafts: Readonly<Record<string, Draft>>,
): { args?: PluginCommandArgs; errors: Record<string, string> } {
  const args: Record<string, PluginSettingValue> = {};
  const errors: Record<string, string> = {};
  for (const [name, field] of fields) {
    const draft = drafts[name] ?? initialDraft(field);
    if (draft === "") {
      if (field.required) errors[name] = FILL_THIS_IN;
      continue;
    }
    const value = typedValue(field, draft);
    const problem = settingValueProblem(field, value);
    if (problem === null) {
      args[name] = value;
    } else {
      errors[name] = settingProblemLine(problem);
    }
  }
  return Object.keys(errors).length > 0 ? { errors } : { args, errors };
}

/** A number field's text as a number when it is one, so the check says what to use otherwise. */
function typedValue(field: FormField, draft: Draft): PluginSettingValue {
  if (field.type !== "number" || typeof draft !== "string") return draft;
  const number = Number(draft.trim());
  return draft.trim() !== "" && Number.isFinite(number) ? number : draft;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
