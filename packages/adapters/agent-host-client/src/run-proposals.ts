import type { ProposedRecord } from "@halonicjs/app";
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
