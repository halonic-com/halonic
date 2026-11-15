import { isPayPerUse } from "@halonicjs/workspace";
import type { ModelsState } from "../aliases/read-models.ts";
import type { ModelKeys } from "../api.ts";
import { providerName } from "../providers/provider-rows.ts";

/** The chip words (mc 24, flow-settings 4). */
export const BUDGET_USED_UP = "Budget used up";

export function noKeyFor(provider: string): string {
  return `No key for ${provider}`;
}

/** What Settings → Models needs to tell what is wrong. */
export interface ProblemInput {
  readonly state: ModelsState;
  /** This month's estimated cost; `undefined` until the run list has been read. */
  readonly spent: number | undefined;
  /** Whether a key is stored under each secret name that has been looked up. */
  readonly stored: ReadonlyMap<string, boolean>;
}

/** The secret names whose stored key `problems` wants to know about: those of cloud providers. */
export function secretsToCheck(state: ModelsState): string[] {
  if (state.status === "loading" || state.localOnly) return [];
  return state.providers.flatMap(({ local, secret }) =>
    local || secret === undefined ? [] : [secret],
  );
}

/** Looks up each secret; a lookup that fails leaves it out, so it makes no chip. */
export async function lookUpKeys(
  keys: ModelKeys | undefined,
  secrets: readonly string[],
): Promise<ReadonlyMap<string, boolean>> {
  const found = new Map<string, boolean>();
  await Promise.all(
    secrets.map(async (secret) => {
      try {
        found.set(secret, (await keys?.stored(secret)) ?? true);
      } catch {
        // Unknown is not missing.
      }
    }),
  );
  return found;
}

/**
 * The chips of the section, in order: "Budget used up" first (the same test as the status bar,
 * so only where a provider may bill per use), then "No key for Anthropic" for each provider
 * whose stored key is known to be missing. A check that failed or hasn't answered shows no chip.
 */
export function problems({ state, spent, stored }: ProblemInput): string[] {
  if (state.status === "loading") return [];
  const chips: string[] = [];
  const monthly = state.budget?.monthly;
  const billsPerUse = !state.localOnly && state.providers.some(isPayPerUse);
  if (billsPerUse && monthly !== undefined && spent !== undefined && spent >= monthly) {
    chips.push(BUDGET_USED_UP);
  }
  const providers = state.localOnly ? [] : state.providers.filter(({ local }) => !local);
  for (const provider of providers) {
    if (provider.secret !== undefined && stored.get(provider.secret) === false) {
      chips.push(noKeyFor(providerName(provider)));
    }
  }
  return chips;
}
