import type { ProposalTarget, ProposedRecord, RefusalReason } from "@halonicjs/app";
import { type Infer, s } from "@halonicjs/schema-kit";
import { type AgentHostTransport, readAnswer } from "./transport.ts";

const text = s.string().min(1);
const digest = s.string().regex(/^sha256:./);

const file = s
  .object({
    path: text,
    change: s.enum(["added", "modified", "deleted"]),
    base: s.union([s.literal("absent"), s.object({ digest }).strict()]),
  })
  .strict();

const shared = { runId: text, files: s.array(file), items: s.array(text) };

const record = s
  .object({
    state: s.literal("proposed"),
    proposal: s.discriminatedUnion("history", [
      s.object({ ...shared, history: s.literal("git"), base: text, ref: text }).strict(),
      s.object({ ...shared, history: s.literal("off"), base: s.null(), ref: s.null() }).strict(),
    ]),
    finishedAt: text,
    decisions: s.record(
      s.string(),
      s.enum(["accepted", "rejected", "undecided", "not-applicable"]),
    ),
    partly: s.record(s.string(), s.object({ saved: digest, run: s.string() }).strict()).optional(),
    settled: s
      .object({ at: text, why: s.enum(["decided", "expired", "unavailable"]) })
      .strict()
      .optional(),
  })
  .strict();

const listAnswer = s.object({ proposals: s.array(record) }).strict();

const refusal = s
  .object({ path: text, why: s.enum(["under-git", "under-halonic", "outside-workspace"]) })
  .strict();

const acceptAnswer = s
  .object({
    undo: text.nullable(),
    written: s.array(text),
    changedOnDisk: s.array(text),
    refused: s.array(refusal),
  })
  .strict();

const rejectAnswer = s.object({ undo: text }).strict();

const restoreAnswer = s
  .object({ changedOnDisk: s.array(text), refused: s.array(refusal), decidedAfter: s.boolean() })
  .strict();

const settleAnswer = s.object({ result: s.enum(["settled", "open"]) }).strict();

const removeAnswer = s.object({}).strict();

/** What an accept did, as the host answers it: `undo` is the id of its step, `null` when nothing was written. */
export interface ProposalAccepted {
  readonly undo: string | null;
  readonly written: readonly string[];
  /** Files the person changed since the run started: nothing was written to them. */
  readonly changedOnDisk: readonly string[];
  readonly refused: readonly { readonly path: string; readonly why: RefusalReason }[];
}

/** What an Undo or a Redo left alone, as the host answers it. */
export interface ProposalRestored {
  readonly changedOnDisk: readonly string[];
  readonly refused: readonly { readonly path: string; readonly why: RefusalReason }[];
  /** A later decision on one of the step's files kept all of it from coming back. */
  readonly decidedAfter: boolean;
}

/**
 * A workspace's run proposals, as the agent host lists them from the records
 * it keeps (`agent-host.proposal-decision-routes`). Only the workspace goes
 * to the host.
 *
 * @example
 * const proposals = new AgentHostRunProposals(transport, workspace);
 * const open = await proposals.list(); // newest first
 */
export class AgentHostRunProposals {
  readonly #transport: AgentHostTransport;
  readonly #workspace: string;

  /** @param workspace - the workspace the runs are in; the host serves it only when the launcher named it */
  constructor(transport: AgentHostTransport, workspace: string) {
    this.#transport = transport;
    this.#workspace = workspace;
  }

  /**
   * The proposals still open, newest first.
   *
   * @throws {@link AgentHostError} with the host's kind, such as `unknown_workspace`, or
   *   `answer_invalid` when a record isn't one
   */
  async list(): Promise<readonly ProposedRecord[]> {
    const route = "POST /v1/proposals/list";
    const answer = await this.#transport.request(route, { workspace: this.#workspace });
    return readAnswer(route, answer, listAnswer).proposals.map(recordOf);
  }

  /**
   * Accepts one file of run `runId`'s proposal, or every undecided one: the host writes the run's
   * text and keeps the undo step, and answers its id.
   *
   * @throws {@link AgentHostError} with the host's kind, such as `unknown_proposal` or `proposal_refused`
   */
  async accept(runId: string, target: ProposalTarget): Promise<ProposalAccepted> {
    const route = "POST /v1/proposals/accept";
    const answer = await this.#transport.request(route, this.#decision(runId, target));
    return readAnswer(route, answer, acceptAnswer);
  }

  /**
   * Rejects one file of run `runId`'s proposal, or every undecided one, and answers the id of its
   * undo step.
   *
   * @throws {@link AgentHostError} with the host's kind
   */
  async reject(runId: string, target: ProposalTarget): Promise<{ readonly undo: string }> {
    const route = "POST /v1/proposals/reject";
    const answer = await this.#transport.request(route, this.#decision(runId, target));
    return readAnswer(route, answer, rejectAnswer);
  }

  /**
   * Undoes (`before`) or redoes (`after`) the decision whose undo id the host answered. Only the
   * id goes to the host, never the step's texts.
   *
   * @throws {@link AgentHostError} with the host's kind, such as `unknown_undo`
   */
  async restore(undo: string, to: "before" | "after"): Promise<ProposalRestored> {
    const route = "POST /v1/proposals/restore";
    const answer = await this.#transport.request(route, { workspace: this.#workspace, undo, to });
    return readAnswer(route, answer, restoreAnswer);
  }

  /**
   * Settles run `runId`'s proposal once nothing is left to decide, which drops its undo steps:
   * `open` when a file can still be decided.
   *
   * @throws {@link AgentHostError} with the host's kind
   */
  async settle(runId: string): Promise<"settled" | "open"> {
    const route = "POST /v1/proposals/settle";
    const answer = await this.#transport.request(route, { workspace: this.#workspace, runId });
    return readAnswer(route, answer, settleAnswer).result;
  }

  /**
   * Removes run `runId`'s proposal once its texts are gone, so it can't be opened any more: it
   * goes to Done as not reviewed, and the host drops its undo steps. A proposal that can still be
   * opened is refused.
   *
   * @throws {@link AgentHostError} with the host's kind, such as `proposal_refused`
   */
  async remove(runId: string): Promise<void> {
    const route = "POST /v1/proposals/remove";
    const answer = await this.#transport.request(route, { workspace: this.#workspace, runId });
    readAnswer(route, answer, removeAnswer);
  }

  #decision(runId: string, target: ProposalTarget) {
    return { workspace: this.#workspace, runId, target };
  }
}

/** A digest `digest`'s pattern checked. */
const sha256 = (value: string) => value as `sha256:${string}`;

/** The record as the app types it: digests typed, and an absent field left out, not `undefined`. */
function recordOf({ proposal, partly, settled, ...fields }: Infer<typeof record>): ProposedRecord {
  const files = proposal.files.map((file) => ({
    ...file,
    base: file.base === "absent" ? file.base : { digest: sha256(file.base.digest) },
  }));
  const saved = (entry: { saved: string; run: string }) => ({
    ...entry,
    saved: sha256(entry.saved),
  });
  return {
    ...fields,
    proposal: { ...proposal, files },
    ...(partly === undefined
      ? {}
      : {
          partly: Object.fromEntries(Object.entries(partly).map(([path, e]) => [path, saved(e)])),
        }),
    ...(settled === undefined ? {} : { settled }),
  };
}
