import type { ChiefLineApi } from "./chief-line.ts";
import { readRecords } from "./chief-line.ts";
import { chiefLineStateKey } from "./chief-line-settings.ts";

/**
 * The tracked pull request index (HAL-18586): which callers track which pull
 * request, in plugin state, so `POST /chief-line/pr-event` can answer an
 * untracked pull request, nearly every `ci-ok` in the repository, before it
 * reads anything from Paperclip. `track` adds to it and every PR watcher pass
 * rewrites it from the markers on the threads, which stay the source of truth:
 * a reinstall clears the index, and the next pass rebuilds it. Until then an
 * event the webhook skips is posted by the pass.
 */

type IndexApi = Pick<ChiefLineApi, "state">;

/** The index's key for one pull request. */
const pullKey = (repo: string, number: number) => `${repo}#${number}`;

/** The callers tracking a pull request, by the index; empty when none does. */
export async function indexedCallers(
  ctx: IndexApi,
  companyId: string,
  repo: string,
  number: number,
): Promise<string[]> {
  const index = await readRecords<string[]>(ctx, companyId, "tracked");
  return index[pullKey(repo, number)] ?? [];
}

/** Adds a caller to a pull request's entry, as `track` registers it. */
export async function addToIndex(
  ctx: IndexApi,
  companyId: string,
  { repo, number, caller }: { repo: string; number: number; caller: string },
): Promise<void> {
  const index = await readRecords<string[]>(ctx, companyId, "tracked");
  const key = pullKey(repo, number);
  const callers = index[key] ?? [];
  if (!callers.includes(caller)) {
    await ctx.state.set(chiefLineStateKey(companyId, "tracked"), {
      ...index,
      [key]: [...callers, caller],
    });
  }
}

/** Replaces the index with the pull requests each caller tracks, as a pass read them. */
export async function writeIndex(
  ctx: IndexApi,
  companyId: string,
  byCaller: ReadonlyMap<string, readonly { repo: string; number: number }[]>,
): Promise<void> {
  const index: Record<string, string[]> = {};
  for (const [caller, pulls] of byCaller) {
    for (const { repo, number } of pulls) {
      const key = pullKey(repo, number);
      index[key] = [...(index[key] ?? []), caller];
    }
  }
  await ctx.state.set(chiefLineStateKey(companyId, "tracked"), index);
}
