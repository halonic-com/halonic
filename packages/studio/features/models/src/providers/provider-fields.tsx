import type { Provider } from "@halonicjs/format";
import { Field, FormRows, Input, Switch } from "@halonicjs/studio-kit";
import { useState } from "react";
import { useDraft } from "../aliases/use-draft.ts";
import type { ModelsFiles } from "../api.ts";
import { editProvider, type ProviderField, type ProviderProblem } from "./provider-edits.ts";
import { DEFAULT_BASE_URL, providerUpdatedLine } from "./provider-text.ts";

/** The props of {@link ProviderFields}. */
export interface ProviderFieldsProps {
  readonly files: ModelsFiles;
  readonly provider: Provider;
  /** The provider's file, like `providers/ollama.yaml`. */
  readonly path: string;
}

/**
 * The editable fields of a provider's page (`models.providers.edit`): name, type, base URL, secret
 * name and the local switch. Each change is saved when the field is left (the switch at once), and
 * the status line says so.
 *
 * @example
 * <ProviderFields files={files} provider={provider} path="providers/ollama.yaml" />
 */
export function ProviderFields({ files, provider, path }: ProviderFieldsProps) {
  const [problem, setProblem] = useState<ProviderProblem>();
  const [status, setStatus] = useState("");
  const [name, setName] = useDraft(provider.name ?? "");
  const [type, setType] = useDraft(provider.type);
  const [baseUrl, setBaseUrl] = useDraft(provider.baseUrl ?? "");
  const [secret, setSecret] = useDraft(provider.secret ?? "");

  const save = async (field: ProviderField, value: string | boolean) => {
    const text = await files.readProvider(path);
    const edited = text === null ? undefined : editProvider(text, field, value, provider.id);
    if (edited === undefined) return;
    if (!edited.ok) {
      setProblem(edited.error);
      setStatus("");
      return;
    }
    setProblem((shown) => (shown?.field === field || shown?.field === "yaml" ? undefined : shown));
    if (edited.value === text) return;
    files.changeProvider(path, providerUpdatedLine(provider.name ?? provider.id), edited.value);
    setStatus(providerUpdatedLine(provider.name ?? provider.id));
  };
  const problemFor = (field: ProviderField) => (problem?.field === field ? problem.message : null);
  const onBlur = (field: ProviderField, draft: string, saved: string | undefined) =>
    draft.trim() !== (saved ?? "") ? void save(field, draft) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <FormRows>
        <Field label="Name" error={problemFor("name")}>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => onBlur("name", name, provider.name)}
          />
        </Field>
        <Field label="Type" error={problemFor("type")}>
          <Input
            value={type}
            onChange={(event) => setType(event.target.value)}
            onBlur={() => onBlur("type", type, provider.type)}
          />
        </Field>
        <Field
          label="Base URL"
          hint={`Empty means ${DEFAULT_BASE_URL.toLowerCase()}.`}
          error={problemFor("baseUrl")}
        >
          <Input
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            onBlur={() => onBlur("baseUrl", baseUrl, provider.baseUrl)}
          />
        </Field>
        <Field label="Secret name" error={problemFor("secret")}>
          <Input
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            onBlur={() => onBlur("secret", secret, provider.secret)}
          />
        </Field>
      </FormRows>
      <Switch checked={provider.local} onChange={(local) => void save("local", local)}>
        Runs on this machine or your own network
      </Switch>
      {problem?.field === "yaml" ? <p role="alert">{problem.message}</p> : null}
      <p role="status">{status}</p>
    </div>
  );
}
