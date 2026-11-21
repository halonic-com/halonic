import type { RunSummary } from "@halonicjs/events";
import { type Provider, parseFile } from "@halonicjs/format";
import type { AgentsHost } from "@halonicjs/studio-feature-agents/api";
import type { ModelKeys, ModelsFiles, ProviderCheck } from "@halonicjs/studio-feature-models/api";

/** The alias step 1 is about: the model agents use when nothing else names one. */
export const DEFAULT_ALIAS = "default";

/** The type of the built-in test model's provider, which repeats the message back. */
const TEST_MODEL_TYPE = "mock";

/** The provider behind the `default` alias, as step 1 judges it (`first-run.own-progress`). */
export type DefaultProvider =
  /** No `default` alias, or its provider file is missing or doesn't read. */
  | { readonly kind: "none" }
  /** The built-in test model (`type: mock`), which never counts. */
  | { readonly kind: "test" }
  /** A provider marked `local: true`: it counts once it answers. */
  | { readonly kind: "local"; readonly provider: Provider }
  /** A cloud provider: it counts once its key is saved, and never while the workspace is local only. */
  | { readonly kind: "cloud"; readonly provider: Provider; readonly localOnly: boolean };

/** What step 1 reads of the workspace's files. */
export type DefaultProviderFiles = Pick<
  ModelsFiles,
  "readModels" | "readProviders" | "readWorkspace"
>;

/**
 * Reads which provider the `default` alias points at, and whether `workspace.yaml` says the
 * workspace is local only. A file that doesn't parse reads as missing, since the Models pages
 * already name it; a file that can't be read at all rejects, so the card can say so.
 *
 * @example
 * await readDefaultProvider(files); // { kind: "test" } in a new workspace
 */
export async function readDefaultProvider(files: DefaultProviderFiles): Promise<DefaultProvider> {
  const [modelsText, providerFiles, workspaceText] = await Promise.all([
    files.readModels(),
    files.readProviders(),
    files.readWorkspace(),
  ]);
  const alias = modelsText === null ? undefined : defaultAliasOf(modelsText);
  if (alias === undefined) return { kind: "none" };
  const file = providerFiles.find(({ path }) => providerIdOf(path) === alias.provider);
  const parsed =
    file === undefined ? undefined : parseFile("provider", file.text, { id: alias.provider });
  if (!parsed?.ok) return { kind: "none" };
  const provider = parsed.value.value;
  if (provider.type === TEST_MODEL_TYPE) return { kind: "test" };
  if (provider.local) return { kind: "local", provider };
  return { kind: "cloud", provider, localOnly: localOnlyOf(workspaceText) };
}

/** Step 1 as its row shows it: done, not done, or a local provider that doesn't answer. */
export type ModelStep =
  | { readonly status: "done" }
  | { readonly status: "todo" }
  /** The row's problem state; `address` is where the provider was asked, such as `localhost:11434`. */
  | { readonly status: "not-answering"; readonly address: string | undefined };

/** How step 1 finds out about a provider; either can be missing where the app offers none. */
export interface ModelStepProbes {
  readonly keys?: Pick<ModelKeys, "stored"> | undefined;
  readonly check?: ProviderCheck | undefined;
}

/**
 * Whether step 1, **Connect your own model**, is done for `provider`: a local provider counts once
 * it answers, a cloud one once its key is saved and the workspace isn't local only (Models blocks
 * it then). The test model never counts. A key store that can't be read rejects.
 *
 * @example
 * await modelStep({ kind: "test" }, probes); // { status: "todo" }
 */
export async function modelStep(
  provider: DefaultProvider,
  { keys, check }: ModelStepProbes,
): Promise<ModelStep> {
  switch (provider.kind) {
    case "none":
    case "test":
      return { status: "todo" };
    case "local":
      return localModelStep(provider.provider, check);
    case "cloud":
      return cloudModelStep(provider, keys);
  }
}

async function localModelStep(
  provider: Provider,
  check: ProviderCheck | undefined,
): Promise<ModelStep> {
  // Without a check there is no way to tell it answers, so the step isn't claimed done.
  if (check === undefined) return { status: "todo" };
  if (await check.isAnswering(provider)) return { status: "done" };
  return { status: "not-answering", address: check.addressOf(provider) };
}

async function cloudModelStep(
  { provider, localOnly }: Extract<DefaultProvider, { kind: "cloud" }>,
  keys: Pick<ModelKeys, "stored"> | undefined,
): Promise<ModelStep> {
  if (localOnly || keys === undefined || provider.secret === undefined) return { status: "todo" };
  return (await keys.stored(provider.secret)) ? { status: "done" } : { status: "todo" };
}

/**
 * Whether step 2, **Make your first agent**, is done: the workspace has an agent. It rejects when
 * the agents can't be read.
 */
export async function agentStepDone(agents: Pick<AgentsHost, "list">): Promise<boolean> {
  return (await agents.list()).length > 0;
}

/**
 * Whether step 3, **Run it once**, is done: a run (not a test) in this workspace has finished.
 * Agents mostly run as a workflow's step, so any workflow's finished run counts; a failed or
 * one that couldn't try doesn't.
 */
export function runStepDone(runs: readonly Pick<RunSummary, "kind" | "status">[]): boolean {
  return runs.some((run) => run.kind === "run" && run.status === "completed");
}

/** What this device remembers of a folder's Get set up card. */
export type OwnCardMemory =
  /** The card was never worked out for this folder. */
  | "unseen"
  /** The card has shown with steps left. */
  | "showing"
  /** The card showed all three done, or had nothing left the first time: it stays gone. */
  | "finished";

/** Whether the card shows on this visit, and what to remember for the next. */
export interface OwnCardVisit {
  readonly shows: boolean;
  readonly remember: OwnCardMemory;
}

/**
 * Whether Get set up shows when Home opens, from what the device remembers and whether all three
 * steps are done now. A card that finishes shows for that visit and is gone the next. A folder
 * that already had all three done the first time is remembered as finished and never shows, so a
 * workspace from before Get set up doesn't greet anyone with "3 of 3 done".
 *
 * @example
 * ownCardVisit("unseen", true); // { shows: false, remember: "finished" }
 */
export function ownCardVisit(memory: OwnCardMemory, allDone: boolean): OwnCardVisit {
  if (memory === "finished") return { shows: false, remember: "finished" };
  if (memory === "unseen" && allDone) return { shows: false, remember: "finished" };
  return { shows: true, remember: allDone ? "finished" : "showing" };
}

/** The `default` alias of `models.yaml`, or `undefined` when it has none or doesn't parse. */
function defaultAliasOf(text: string): { readonly provider: string } | undefined {
  const parsed = parseFile("models", text);
  return parsed.ok ? parsed.value.value.aliases[DEFAULT_ALIAS] : undefined;
}

/** `privacy.localOnly` of `workspace.yaml`; a missing or unreadable file reads as off, as Models reads it. */
function localOnlyOf(text: string | null): boolean {
  const parsed = text === null ? undefined : parseFile("workspace", text);
  return parsed?.ok ? parsed.value.value.privacy.localOnly : false;
}

/** A provider's id: its file's name without the folder or `.yaml`. */
function providerIdOf(path: string): string {
  return path.replace(/^.*\//, "").replace(/\.ya?ml$/, "");
}
