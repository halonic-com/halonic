import type { Digest } from "@halonicjs/ports";
import { RunProposals } from "../run-proposals.ts";
import { TestDefinitionStore } from "./memory-definition-store.ts";
import { TestProposalVcs } from "./test-proposal-vcs.ts";
import { TestTrash } from "./test-trash.ts";

/** `clerk.agent.yaml` at the runs' version. */
export const clerk = "name: Clerk\nmodel: fast\n";
/** `old.agent.yaml` at the runs' version. */
export const old = "name: Old\n";

/**
 * A proposal service over an in-memory workspace whose saved files are its
 * version `version`, as after Create version.
 *
 * @param digest - hashes text; core has none of its own, so the test passes one in
 * @param extraFiles - more saved files, by path, also in the version
 */
export function setUpProposals(digest: Digest, extraFiles: Readonly<Record<string, string>> = {}) {
  const files = {
    "agents/clerk.agent.yaml": clerk,
    "agents/old.agent.yaml": old,
    "README.md": "# Acme\n",
    ...extraFiles,
  };
  const vcs = new TestProposalVcs();
  const records = new TestDefinitionStore({}, digest);
  const store = new TestDefinitionStore(files, digest);
  const trash = new TestTrash(store, digest);
  const endFailures: { runId: string; error: unknown }[] = [];
  const proposals = new RunProposals({
    vcs,
    records,
    digest,
    clock: { now: () => new Date("2026-11-11T09:00:00.000Z") },
    onEndFailed: (runId, error) => endFailures.push({ runId, error }),
    store,
    trash,
  });
  return { vcs, records, store, trash, proposals, endFailures, version: vcs.commit(files) };
}

/**
 * Runs `runId` in a worktree where `change` changes files as the run
 * would, and ends it.
 */
export async function proposeRun(
  setup: ReturnType<typeof setUpProposals>,
  runId: string,
  change: (files: Map<string, string>) => void,
) {
  const { folder } = await setup.proposals.open(runId, setup.version);
  change(setup.vcs.filesOf(folder));
  const proposal = await setup.proposals.end(runId);
  if (proposal === null) {
    throw new Error(`Run ${runId} proposed nothing.`);
  }
  return proposal;
}
