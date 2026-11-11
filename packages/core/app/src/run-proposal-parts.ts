// Accept and Reject of one part or one change inside a file of a run's
// proposal (HAL-3248, AI changes 2): the same line parts and `revertParts`
// as the assistant's changes to review (HAL-3277), between the saved file
// and what is left of the run's text. Internal to `core/app`.

import { applyLineChanges, contentDigest, diffLines, matchesExpected } from "@halonicjs/std";
import { type ItemPath, revertParts } from "./changes/revert-parts.ts";
import { refused, storeRefusing } from "./review-gate.ts";
import { type DecideContext, expectedOf, refusalOf } from "./run-proposal-decide.ts";
import { type ProposalDecisions, settledOnReject, stepOf } from "./run-proposal-decisions.ts";
import type { PartlyDecided, ProposedRecord } from "./run-proposal-record.ts";
import type { ProposalRecordStore } from "./run-proposal-store.ts";
import type {
  Decision,
  InFileProposalTarget,
  InFileResult,
  ProposalFileParts,
  ProposedFile,
  RefusalReason,
  UndoFileWrite,
} from "./run-proposal-types.ts";

/** Where an undecided file the run modified stands, read in the run's turn. */
type OpenFile = {
  readonly kind: "open";
  readonly file: ProposedFile;
  /** What the saved file holds, and so what the next write expects. */
  readonly expected: PartlyDecided["saved"];
  readonly view: ProposalFileParts;
};

/** Why a file has no parts to decide right now. */
type ClosedFile =
  | { readonly kind: "decided" }
  | { readonly kind: "whole"; readonly message: string }
  | { readonly kind: "refused"; readonly why: RefusalReason }
  | { readonly kind: "changed-on-disk" };

/** The new text of one side, or the result when there is nothing to write. */
type Decided = { readonly status: "text"; readonly text: string } | InFileResult;

const nothingWritten = { undo: null, written: [], changedOnDisk: [], refused: [] } as const;

/** The parts and changes inside the files of one workspace's run proposals. */
export class ProposalParts {
  private readonly records: ProposalRecordStore;
  private readonly context: DecideContext;
  private readonly decisions: ProposalDecisions;

  constructor(records: ProposalRecordStore, context: DecideContext, decisions: ProposalDecisions) {
    this.records = records;
    this.context = context;
    this.decisions = decisions;
  }

  /** See `RunProposals.parts`. */
  parts(runId: string, path: string): Promise<ProposalFileParts | null> {
    return this.records.inTurn(runId, async () => {
      const state = await this.stateOf(await this.records.proposed(runId), path);
      return state.kind === "open" ? state.view : null;
    });
  }

  /** See `RunProposals.acceptInFile` and `RunProposals.rejectInFile`. */
  decide(
    runId: string,
    target: InFileProposalTarget,
    decision: "accept" | "reject",
  ): Promise<InFileResult> {
    return this.records.inTurn(runId, async () => {
      const record = await this.records.proposed(runId);
      const state = await this.stateOf(record, target.file);
      if (state.kind !== "open") {
        return await this.closed(record, target.file, state);
      }
      if (state.view.seen !== target.seen) {
        return { status: "stale", path: target.file };
      }
      const decided =
        target.kind === "part"
          ? decidedPart(state.view, target.part, decision)
          : decidedChange(state.view, target.parts, decision);
      if (decided.status !== "text") {
        return decided;
      }
      return decision === "accept"
        ? await this.acceptText(record, state, decided.text)
        : await this.rejectText(record, state, decided.text);
    });
  }

  /** Writes the saved file with one more part or change accepted. */
  private async acceptText(
    record: ProposedRecord,
    state: OpenFile,
    text: string,
  ): Promise<InFileResult> {
    const { path } = state.view;
    const written = await storeRefusing(() =>
      this.context.store.write(path, text, { expected: state.expected }),
    );
    if (written === refused) {
      return await this.closed(record, path, { kind: "refused", why: "outside-workspace" });
    }
    if (written.status === "changed-on-disk") {
      return { status: "done", ...nothingWritten, changedOnDisk: [path] };
    }
    const next = { saved: await contentDigest(text, this.context.digest), run: state.view.run };
    // Accepting the last part leaves the saved file as the run's text: the file is accepted.
    const settled: Decision | null = text === state.view.run ? "accepted" : null;
    const write: UndoFileWrite = { path, before: state.view.saved, after: text };
    const entries = await this.saveFile(record, path, next, settled);
    return {
      status: "done",
      undo: stepOf(record.proposal.runId, [write, ...entries]),
      written: [path],
      changedOnDisk: [],
      refused: [],
    };
  }

  /** Takes one part or change out of the run's text; the saved file stays as it is. */
  private async rejectText(
    record: ProposedRecord,
    state: OpenFile,
    run: string,
  ): Promise<InFileResult> {
    const { path, saved } = state.view;
    // Rejecting the last part settles the file as a whole-file Reject would.
    const settled = run === saved ? settledOnReject(state.file, record.partly?.[path]) : null;
    const entries = await this.saveFile(record, path, { saved: state.expected, run }, settled);
    return { status: "done", ...nothingWritten, undo: stepOf(record.proposal.runId, entries) };
  }

  /** Saves where one file stands: still partly decided, or `settled`. */
  private saveFile(
    record: ProposedRecord,
    path: string,
    next: PartlyDecided,
    settled: Decision | null,
  ): ReturnType<ProposalDecisions["saveDecisions"]> {
    const decisions = { ...record.decisions, [path]: settled ?? "undecided" };
    return this.decisions.saveDecisions(record, decisions, { ...record.partly, [path]: next });
  }

  /** The answer for a file with no parts to decide; a refused one becomes not applicable. */
  private async closed(
    record: ProposedRecord,
    path: string,
    state: ClosedFile,
  ): Promise<InFileResult> {
    switch (state.kind) {
      case "decided":
        // Decided as a whole since the parts were shown.
        return { status: "stale", path };
      case "whole":
        return { status: "cant-separate", path, message: state.message };
      case "changed-on-disk":
        return { status: "done", ...nothingWritten, changedOnDisk: [path] };
      case "refused": {
        const decisions = { ...record.decisions, [path]: "not-applicable" as const };
        await this.decisions.saveDecisions(record, decisions);
        return { status: "done", ...nothingWritten, refused: [{ path, why: state.why }] };
      }
    }
  }

  /**
   * Where a file stands: open with its parts, or why it has none.
   *
   * @throws when the run doesn't propose the file, or its ref is gone
   */
  private async stateOf(record: ProposedRecord, path: string): Promise<OpenFile | ClosedFile> {
    const file = record.proposal.files.find((proposed) => proposed.path === path);
    if (file === undefined) {
      throw new Error(`Run ${record.proposal.runId} proposes no change to ${path}.`);
    }
    if (record.decisions[path] !== "undecided") {
      return { kind: "decided" };
    }
    if (file.change !== "modified") {
      return {
        kind: "whole",
        message: `The run ${file.change} this file, so you accept or reject it as a whole.`,
      };
    }
    const why = refusalOf(path);
    if (why !== null) {
      return { kind: "refused", why };
    }
    const saved = await storeRefusing(() => this.context.store.read(path));
    if (saved === refused) {
      return { kind: "refused", why: "outside-workspace" };
    }
    const partly = record.partly?.[path];
    const expected = partly?.saved ?? expectedOf(file);
    if (saved === null || !(await matchesExpected(saved, expected, this.context.digest))) {
      return { kind: "changed-on-disk" };
    }
    const run = partly?.run ?? (await this.runTextOf(record, path));
    const seen = await contentDigest(JSON.stringify([saved, run]), this.context.digest);
    const view = { path, saved, run, seen, parts: diffLines(saved, run) };
    return { kind: "open", file, expected: expected as PartlyDecided["saved"], view };
  }

  /** The run's text of a file it modified. */
  private async runTextOf(record: ProposedRecord, path: string): Promise<string> {
    const commit = await this.decisions.commitOf(record);
    const run = await this.context.vcs.readAt(commit, path);
    if (run === null) {
      throw new Error(`The proposal of run ${record.proposal.runId} has no text for ${path}.`);
    }
    return run;
  }
}

/** For one part: Accept applies it to the saved file; Reject applies every other part to it. */
function decidedPart(
  view: ProposalFileParts,
  index: number,
  decision: "accept" | "reject",
): Decided {
  const part = view.parts[index];
  if (part === undefined) {
    return { status: "stale", path: view.path };
  }
  const applied = decision === "accept" ? [part] : view.parts.filter((other) => other !== part);
  return { status: "text", text: applyLineChanges(view.saved, applied) };
}

/**
 * For one change: Accept sets its parts in the saved file to the run's
 * values; Reject sets them in the run's text back to the saved file's.
 * The rest of each text, comments and formatting stay as they are.
 */
function decidedChange(
  view: ProposalFileParts,
  parts: readonly ItemPath[],
  decision: "accept" | "reject",
): Decided {
  const cantSeparate = (message: string): Decided => ({
    status: "cant-separate",
    path: view.path,
    message,
  });
  if (parts.length === 0) {
    return cantSeparate("This change is one piece, so you accept or reject it as a whole.");
  }
  const reverted =
    decision === "accept"
      ? revertParts(view.saved, view.run, parts)
      : revertParts(view.run, view.saved, parts);
  if (!reverted.ok) {
    // The person can't act on the parser's error, so it stays off the screen.
    return cantSeparate(
      "Couldn't split this change into parts, so accept or reject it as a whole.",
    );
  }
  // Item paths that change nothing name a change that isn't there (any more).
  const unchanged = decision === "accept" ? view.saved : view.run;
  if (reverted.value === unchanged) {
    return { status: "stale", path: view.path };
  }
  return { status: "text", text: reverted.value };
}
