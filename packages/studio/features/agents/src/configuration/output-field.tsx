import { Field, type Tab, TabList, TabPanel, TextArea, useTabIds } from "@halonicjs/studio-kit";
import { type AutoSaved, useAutoSaved, useReportNotSaved } from "@halonicjs/studio-shell";
import { useEffect, useId, useRef, useState } from "react";
import type { AgentChange, AgentOutput } from "../api.ts";
import { configurationWords as words } from "./configuration-words.ts";
import { OptionChips } from "./option-chips.tsx";

type OutputKind = AgentOutput["type"];

const kinds: readonly Tab<OutputKind>[] = (["text", "choice", "json"] as const).map((id) => ({
  id,
  label: words.outputKinds[id],
}));

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The sentence for a schema box with a mistake: text that isn't JSON, or JSON that isn't an
 * object. `null` when it is fine, or empty, which means no schema.
 */
export const schemaCheck = (text: string): string | null => {
  if (text.trim() === "") return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    // The parser's own message names a character position, not something a person can act on.
    return words.schemaInvalid;
  }
  return isJsonObject(value) ? null : words.schemaNotObject;
};

/** The output for a schema box that {@link schemaCheck} found fine. */
function jsonOutput(text: string): AgentOutput {
  if (text.trim() === "") return { type: "json" };
  const schema: unknown = JSON.parse(text);
  return isJsonObject(schema) ? { type: "json", schema } : { type: "json" };
}

/** What the schema box shows of the file: its schema laid out, or nothing. */
function schemaText(output: AgentOutput): string {
  return output.type === "json" && output.schema !== undefined
    ? JSON.stringify(output.schema, null, 2)
    : "";
}

/** Props for {@link OutputField}. */
export interface OutputFieldProps {
  readonly output: AgentOutput;
  /** Saves one change; resolves to whether it was written. */
  readonly save: (change: AgentChange) => Promise<boolean>;
  /** Hears whether Output is a field not saved (1) or not (0), for the page's count. */
  readonly reportNotSaved?: ((count: number) => void) | undefined;
}

/**
 * Behaviour's Output (`agents.configuration.output`): Text, One of a list or JSON, as Tabs. Each
 * saves by itself like the other fields: picking a tab, adding or removing an option, and a pause
 * in typing the schema or leaving it. A list with no options or a schema with a mistake isn't
 * saved: the file keeps what it had, and the field says what to fix. Until then, or while the
 * schema's save failed, Output counts as a field not saved.
 */
export function OutputField({ output, save, reportNotSaved }: OutputFieldProps) {
  const ids = useTabIds();
  const [kind, setKind] = useState<OutputKind>(output.type);
  const [options, setOptions] = useState<readonly string[]>(
    output.type === "choice" ? output.options : [],
  );
  // The schema saves after a pause; by then the person may have picked another tab.
  const picked = useRef(kind);
  const schema = useAutoSaved(
    schemaText(output),
    async (text) => picked.current === "json" && save({ output: jsonOutput(text) }),
    schemaCheck,
  );
  // Only the picked tab's mistake counts: the others aren't what the file is given.
  const notSaved =
    (kind === "choice" && options.length === 0) || (kind === "json" && schema.notSaved);
  useReportNotSaved(reportNotSaved, [{ notSaved }]);

  // A change made elsewhere (the file edited, Undo) shows here. Comparing the text, not the
  // object, keeps a tab picked but not saved yet while other fields save.
  const fileOutput = JSON.stringify(output);
  useEffect(() => {
    setKind(output.type);
    picked.current = output.type;
    if (output.type === "choice") setOptions(output.options);
  }, [fileOutput]);

  /** The output a tab saves, or `undefined` while it has a mistake. */
  const outputOf = (next: OutputKind): AgentOutput | undefined => {
    if (next === "text") return { type: "text" };
    if (next === "choice") return options.length > 0 ? { type: "choice", options } : undefined;
    return schemaCheck(schema.value) === null ? jsonOutput(schema.value) : undefined;
  };

  const pick = (next: OutputKind) => {
    if (next === kind) return;
    setKind(next);
    picked.current = next;
    const change = outputOf(next);
    if (change !== undefined) void save({ output: change });
  };

  const changeOptions = (next: readonly string[]) => {
    setOptions(next);
    if (next.length > 0) void save({ output: { type: "choice", options: next } });
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption text-fg-muted" aria-hidden="true">
        {words.output}
      </p>
      <TabList label={words.output} tabs={kinds} selected={kind} onSelect={pick} ids={ids} />
      <TabPanel ids={ids} tabs={kinds} selected={kind}>
        {kind === "choice" && <ChoicePanel options={options} onChange={changeOptions} />}
        {kind === "json" && <SchemaPanel schema={schema} />}
      </TabPanel>
    </div>
  );
}

/** One of a list's panel: the options as chips, and the error while there are none. */
function ChoicePanel({
  options,
  onChange,
}: {
  readonly options: readonly string[];
  readonly onChange: (next: readonly string[]) => void;
}) {
  const errorId = useId();
  const error = options.length === 0 ? words.noOptions : null;
  return (
    <div className="flex flex-col gap-1 pt-2">
      <OptionChips
        label={words.outputKinds.choice}
        options={options}
        onChange={onChange}
        describedBy={error === null ? undefined : errorId}
      />
      {error !== null && (
        <p id={errorId} className="text-small text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** JSON's panel: the schema box (microcopy 8.5). */
function SchemaPanel({ schema }: { readonly schema: AutoSaved }) {
  return (
    <div className="pt-2">
      <Field label={words.schema} hint={words.schemaHint} error={schema.error}>
        <TextArea
          minRows={4}
          maxRows={16}
          spellCheck={false}
          value={schema.value}
          onChange={(event) => schema.onChange(event.target.value)}
          onBlur={schema.flush}
        />
      </Field>
    </div>
  );
}
