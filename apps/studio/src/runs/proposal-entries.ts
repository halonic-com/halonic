import type { ProposedRecord } from "@halonicjs/app";
import type { RunProposalEntry } from "@halonicjs/studio-feature-inbox/api";
import type { SourcedRun } from "@halonicjs/studio-feature-runs/api";

/** Where {@link ProposalEntries} reads the host's lists; a list left out has no proposals. */
export interface ProposalSources {
  /** The open run proposals, as the agent host lists them. */
  readonly proposals?: (() => Promise<readonly ProposedRecord[]>) | undefined;
  /** The proposals settled in the last 30 days, as the agent host lists them. */
  readonly doneProposals?: (() => Promise<readonly ProposedRecord[]>) | undefined;
}

/** Both lists of one read: each the host's answer, or why it failed. */
interface Lists {
  readonly open: PromiseSettledResult<readonly RunProposalEntry[]>;
  readonly done: PromiseSettledResult<readonly RunProposalEntry[]>;
}

/**
 * The open and the done run proposals, each with its run's record, or `undefined` when the run's
 * log is gone (`studio.workspace-run-proposals`, `studio.workspace-done-proposals`). The Inbox asks
 * for both lists at once on every load, so asks that meet share one read: both lists come from the
 * host together, and the runs are read once for both, and only when there is a proposal
 * (`studio.workspace-proposal-runs-once`). One list failing leaves the other as it is.
 */
export class ProposalEntries {
  readonly #sources: ProposalSources;
  readonly #runs: () => Promise<readonly SourcedRun[]>;
  /** The read on its way, which an ask meanwhile shares; `undefined` once it is done. */
  #reading: Promise<Lists> | undefined;

  /** @param runs - the workspace's runs, read with the workspace's files so an item's name is known */
  constructor(sources: ProposalSources, runs: () => Promise<readonly SourcedRun[]>) {
    this.#sources = sources;
    this.#runs = runs;
  }

  /** The open proposals; throws when the host's list failed. */
  async open(): Promise<readonly RunProposalEntry[]> {
    return resultOf((await this.#read()).open);
  }

  /** The proposals settled in the last 30 days; throws when the host's list failed. */
  async done(): Promise<readonly RunProposalEntry[]> {
    return resultOf((await this.#read()).done);
  }

  #read(): Promise<Lists> {
    this.#reading ??= this.#readBoth().finally(() => {
      this.#reading = undefined;
    });
    return this.#reading;
  }

  async #readBoth(): Promise<Lists> {
    const [openRecords, doneRecords] = await Promise.allSettled([
      this.#sources.proposals?.() ?? [],
      this.#sources.doneProposals?.() ?? [],
    ]);
    const records = [openRecords, doneRecords].flatMap((list) =>
      list.status === "fulfilled" ? list.value : [],
    );
    const byId =
      records.length === 0
        ? new Map<string, SourcedRun["summary"]>()
        : new Map((await this.#runs()).map(({ summary }) => [summary.id, summary]));
    const withRuns = (
      list: PromiseSettledResult<readonly ProposedRecord[]>,
    ): PromiseSettledResult<readonly RunProposalEntry[]> =>
      list.status === "rejected"
        ? list
        : {
            status: "fulfilled",
            value: list.value.map((record) => ({ record, run: byId.get(record.proposal.runId) })),
          };
    return { open: withRuns(openRecords), done: withRuns(doneRecords) };
  }
}

function resultOf<T>(result: PromiseSettledResult<T>): T {
  if (result.status === "rejected") throw result.reason;
  return result.value;
}
