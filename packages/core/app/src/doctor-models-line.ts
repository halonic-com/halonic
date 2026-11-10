// The Models line of `halonic doctor`, without the words: which mark it gets
// and the facts the CLI words it from (cli-output 3.7). In 0.1 it never calls
// a provider over the internet: for a provider with a key it only checks that
// the key is stored. A provider on this computer, such as Ollama, is asked
// which models it has loaded, and that answer is the resource report's.

import type { DoctorLine } from "./doctor-checks.ts";
import type { LoadedModel, Reading } from "./resource-report.ts";

/** A provider the workspace's model aliases use, as the host found it. */
export type ModelProviderState =
  | {
      /** The provider's id in the workspace, such as "ollama". */
      provider: string;
      /** The name a person reads, such as "Ollama". */
      name: string;
      runs: "on-this-computer";
      /** Where Halonic reaches it, such as "localhost:11434". */
      address: string;
      /** The models it has loaded, or the error when it didn't answer. */
      models: Reading<readonly LoadedModel[]>;
    }
  | {
      provider: string;
      name: string;
      runs: "with-a-key";
      /** Whether the secret that holds its key is set. The key itself never reaches `doctor`. */
      keyStored: boolean;
    };

/** A model alias of the workspace and the provider it goes to. */
export interface AliasProvider {
  /** Such as "smart". */
  alias: string;
  provider: string;
}

/** What the ✓ part of the line says about one provider. */
export type ProviderReport =
  /** "Ollama answering at localhost:11434 · llama3.2 loaded (2.0 GB)" */
  | { provider: string; name: string; answering: true; address: string; models: LoadedModel[] }
  /** "Anthropic: API key stored" */
  | { provider: string; name: string; keyStored: true };

/** One mark under the Models line. */
export type ModelProblem =
  /** ! "smart needs an API key for Anthropic." One per alias, so each alias that can't run is named. */
  | { problem: "no-key"; alias: string; provider: string; name: string }
  /** ✕ "Ollama isn't answering at localhost:11434." (model-unreachable's sentence) */
  | { problem: "unreachable"; provider: string; name: string; address: string };

/** The Models line of `halonic doctor`. */
export interface ModelsLine extends DoctorLine {
  check: "models";
  /** The providers that are ready, in the order given. */
  ready: ProviderReport[];
  /** Unreachable providers first, in the order given, then the aliases without a key. */
  problems: ModelProblem[];
}

/**
 * The Models line of `halonic doctor` (requirement `app.doctor-models`).
 *
 * A provider on this computer that doesn't answer is ✕: every alias that
 * uses it fails, and nothing falls back to the internet by itself. An alias
 * whose provider's key isn't stored is a warning, as an agent's harness that
 * isn't installed is: it stops only what uses that alias. A workspace with
 * no aliases, or no workspace, has no line.
 *
 * @param providers every provider the aliases use, with what the host found
 * @param aliases the workspace's aliases, in the order of `models.yaml`
 * @throws Error when an alias names a provider that isn't in `providers`, because the host passes every provider the aliases use
 *
 * @example
 * modelsLine(
 *   [{ provider: "anthropic", name: "Anthropic", runs: "with-a-key", keyStored: false }],
 *   [{ alias: "smart", provider: "anthropic" }],
 * );
 * // { check: "models", status: "warning", ready: [],
 * //   problems: [{ problem: "no-key", alias: "smart", provider: "anthropic", name: "Anthropic" }] }
 */
export function modelsLine(
  providers: readonly ModelProviderState[],
  aliases: readonly AliasProvider[],
): ModelsLine | undefined {
  const byId = new Map(providers.map((state) => [state.provider, state]));
  for (const { alias, provider } of aliases) {
    if (!byId.has(provider))
      throw new Error(
        `The model alias ${alias} uses the provider ${provider}, which wasn't given.`,
      );
  }
  if (aliases.length === 0) return undefined;

  const problems = [...unreachableProblems(providers), ...noKeyProblems(byId, aliases)];
  return {
    check: "models",
    status: modelsStatus(problems),
    ready: providers.flatMap(providerReport),
    problems,
  };
}

function modelsStatus(problems: readonly ModelProblem[]): ModelsLine["status"] {
  if (problems.some((problem) => problem.problem === "unreachable")) return "failed";
  return problems.length > 0 ? "warning" : "ok";
}

function providerReport(state: ModelProviderState): ProviderReport[] {
  const { provider, name } = state;
  if (state.runs === "with-a-key") {
    return state.keyStored ? [{ provider, name, keyStored: true }] : [];
  }
  if (!state.models.ok) return [];
  return [
    { provider, name, answering: true, address: state.address, models: [...state.models.value] },
  ];
}

/** One problem per provider on this computer that didn't answer. */
function unreachableProblems(providers: readonly ModelProviderState[]): ModelProblem[] {
  const problems: ModelProblem[] = [];
  for (const state of providers) {
    if (state.runs !== "on-this-computer" || state.models.ok) continue;
    problems.push({
      problem: "unreachable",
      provider: state.provider,
      name: state.name,
      address: state.address,
    });
  }
  return problems;
}

/** One problem per alias whose provider's key isn't stored. */
function noKeyProblems(
  byId: ReadonlyMap<string, ModelProviderState>,
  aliases: readonly AliasProvider[],
): ModelProblem[] {
  const problems: ModelProblem[] = [];
  for (const { alias, provider } of aliases) {
    const state = byId.get(provider);
    if (state?.runs !== "with-a-key" || state.keyStored) continue;
    problems.push({ problem: "no-key", alias, provider, name: state.name });
  }
  return problems;
}
