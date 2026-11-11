import type { Digest } from "@halonicjs/ports";
import { RunProposals } from "../run-proposals.ts";
import { TestDefinitionStore } from "./memory-definition-store.ts";
import { TestProposalVcs } from "./test-proposal-vcs.ts";
import { TestRunCopies } from "./test-run-copies.ts";
import { TestTrash } from "./test-trash.ts";

/** `clerk.agent.yaml` at the runs' version. */
export const clerk = "name: Clerk\nmodel: fast\n";
/** `old.agent.yaml` at the runs' version. */
export const old = "name: Old\n";

/**
 * A proposal service over an in-memory workspace whose saved files are its
 * version `version`, as after Create version. With history off, runs
 * start at no version (`startAt` is `null`) and get copies of the saved files.
 *
 * @param digest - hashes text; core has none of its own, so the test passes one in
 * @param extraFiles - more saved files, by path, also in the version
 * @param history - whether runs start at a commit or in a copy
 */
export function setUpProposals(
  digest: Digest,
  extraFiles: Readonly<Record<string, string>> = {},
  history: "git" | "off" = "git",
) {
  const files = {
    "agents/clerk.agent.yaml": clerk,
    "agents/old.agent.yaml": old,
    "README.md": "# Acme\n",
    ...extraFiles,
  };
  const vcs = new TestProposalVcs();
  const copies = new TestRunCopies(digest);
  const records = new TestDefinitionStore({}, digest);
  const store = new TestDefinitionStore(files, digest);
  const trash = new TestTrash(store, digest);
  const endFailures: { runId: string; error: unknown }[] = [];
  // The runs end at this time; a test moves it on to pass 30 days.
  const clock = { time: new Date("2026-11-11T09:00:00.000Z"), now: () => clock.time };
  const proposals = new RunProposals({
    vcs,
    copies,
    records,
    digest,
    clock,
    onEndFailed: (runId, error) => endFailures.push({ runId, error }),
    store,
    trash,
  });
  const version = vcs.commit(files);
  return {
    vcs,
    copies,
    records,
    store,
    trash,
    clock,
    proposals,
    endFailures,
    /** The commit holding the saved files. */
    version,
    /** What a run passes to `open`: the commit, or `null` with history off. */
    startAt: history === "git" ? version : null,
    /** The files of a run's folder, for a test to change as the run would. */
    filesOf: (folder: string) => (history === "git" ? vcs.filesOf(folder) : copies.filesOf(folder)),
  };
}

/**
 * Runs `runId` in a worktree, or a copy with history off, where `change` changes files as the run
 * would, and ends it.
 */
export async function proposeRun(
  setup: ReturnType<typeof setUpProposals>,
  runId: string,
  change: (files: Map<string, string>) => void,
) {
  const { folder } = await setup.proposals.open(runId, setup.startAt);
  change(setup.filesOf(folder));
  const proposal = await setup.proposals.end(runId);
  if (proposal === null) {
    throw new Error(`Run ${runId} proposed nothing.`);
  }
  return proposal;
}
