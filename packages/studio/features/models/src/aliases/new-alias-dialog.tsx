import { Dialog, Field, Input, Select } from "@halonicjs/studio-kit";
import { useRef, useState } from "react";
import type { ModelsFiles } from "../api.ts";
import { addAlias, type FieldProblem } from "./alias-edits.ts";
import {
  aliasAddedLine,
  CREATE,
  CREATING,
  createFailedLine,
  MODEL_FIELD,
  NAME_FIELD,
  NAME_HINT,
  NEW_ALIAS_TITLE,
  PROVIDER_FIELD,
} from "./alias-text.ts";

/** The text a workspace without a `models.yaml` starts from. */
const EMPTY_MODELS = "version: 1\naliases: {}\n";

/** The props of {@link NewAliasDialog}. */
export interface NewAliasDialogProps {
  readonly files: ModelsFiles;
  /** The providers to pick from: those the aliases use and those with a file. */
  readonly providers: readonly string[];
  /** After the alias is written: the caller opens its tab. */
  readonly onCreated: (name: string) => void;
  readonly onCancel: () => void;
  readonly returnFocus: () => HTMLElement | null;
}

/**
 * "New model alias" (`models.aliases.create`): a name, a provider and a model, all an alias needs.
 * **Create** stays pressable while a field is empty and shows what is wrong under it. The alias is
 * written as one undo step; its price and fallbacks are edited in its tab.
 *
 * @example
 * <NewAliasDialog files={files} providers={["anthropic"]} onCreated={openTab} onCancel={close} />
 */
export function NewAliasDialog({
  files,
  providers,
  onCreated,
  onCancel,
  returnFocus,
}: NewAliasDialogProps) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState(providers[0] ?? "");
  const [model, setModel] = useState("");
  const [problem, setProblem] = useState<FieldProblem>();
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);
  const modelField = useRef<HTMLInputElement>(null);

  async function create() {
    setFailure(undefined);
    setBusy(true);
    try {
      const text = (await files.readModels()) ?? EMPTY_MODELS;
      const added = addAlias(text, name, { provider, model });
      if (!added.ok) {
        setProblem(added.error);
        if (added.error.field === "name") nameField.current?.focus();
        else if (added.error.field === "model") modelField.current?.focus();
        else setFailure(createFailedLine(added.error.message));
        setBusy(false);
        return;
      }
      files.changeModels(aliasAddedLine(name.trim()), added.value);
      onCreated(name.trim());
    } catch (error) {
      setFailure(createFailedLine(error instanceof Error ? error.message : String(error)));
      setBusy(false);
    }
  }

  const problemFor = (field: FieldProblem["field"]) =>
    problem?.field === field ? problem.message : null;

  return (
    <Dialog
      title={NEW_ALIAS_TITLE}
      size="md"
      form
      confirm={{ label: CREATE, busyLabel: CREATING }}
      busy={busy}
      {...(failure === undefined ? {} : { error: failure })}
      onConfirm={() => void create()}
      onCancel={onCancel}
      returnFocus={returnFocus}
    >
      <div className="flex flex-col gap-3">
        <Field label={NAME_FIELD} hint={NAME_HINT} error={problemFor("name")}>
          <Input
            ref={nameField}
            autoFocus
            disabled={busy}
            value={name}
            onChange={(event) => {
              setProblem(undefined);
              setName(event.target.value);
            }}
          />
        </Field>
        <Field label={PROVIDER_FIELD}>
          {providers.length === 0 ? (
            <Input value={provider} onChange={(event) => setProvider(event.target.value)} />
          ) : (
            <Select
              options={providers.map((id) => ({ value: id, label: id }))}
              value={provider}
              onChange={setProvider}
            />
          )}
        </Field>
        <Field label={MODEL_FIELD} error={problemFor("model")}>
          <Input
            ref={modelField}
            disabled={busy}
            value={model}
            onChange={(event) => {
              setProblem(undefined);
              setModel(event.target.value);
            }}
          />
        </Field>
      </div>
    </Dialog>
  );
}
