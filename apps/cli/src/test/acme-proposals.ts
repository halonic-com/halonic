import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProposalsSetup } from "../commands/proposals/open-proposals.ts";
import { openLocalProposals } from "../local-proposals.ts";
import { type AcmeRuns, now, writeFiles } from "./acme-runs.ts";

/** A run that finished five minutes before the tests' noon. */
export const fiveMinutesAgo = new Date(now.getTime() - 5 * 60_000);

/** The `proposals` commands' setup for a test: noon on 10 Nov 2026 in UTC and the test's own profile. */
export function acmeProposalsSetup(runs: AcmeRuns): ProposalsSetup {
  return { clock: () => ({ now, timeZone: "UTC" }), profile: runs.profile };
}

/**
 * Leaves a proposal of run `runId` in the test's profile, as a harness run
 * in a workspace with history off would: it runs in a copy of Acme's saved
 * files, where `change` writes each text (or deletes the file for `null`),
 * and ends.
 */
export async function proposeIn(
  runs: AcmeRuns,
  runId: string,
  change: Readonly<Record<string, string | null>>,
  finishedAt: Date = fiveMinutesAgo,
): Promise<void> {
  const { proposals, close } = await openLocalProposals(runs.acme, {
    profile: runs.profile,
    clock: { now: () => finishedAt },
  });
  try {
    const { folder } = await proposals.open(runId, null);
    for (const [path, text] of Object.entries(change)) {
      if (text === null) await rm(join(folder, path));
      else await writeFiles(folder, { [path]: text });
    }
    if ((await proposals.end(runId)) === null) {
      throw new Error(`Run ${runId} proposed nothing.`);
    }
  } finally {
    await close();
  }
}

/** A saved file of Acme's, or `null` when there is none. */
export async function savedFile(runs: AcmeRuns, path: string): Promise<string | null> {
  return await readFile(join(runs.acme, path), "utf8").catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  });
}

/** Changes a saved file of Acme's, as the person would in an editor. */
export async function editSaved(runs: AcmeRuns, path: string, text: string): Promise<void> {
  await writeFile(join(runs.acme, path), text);
}
