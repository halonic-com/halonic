// One entry of the shadow ledger, and the hash chain that links the entries.
// An entry keeps ids, codes and hashes only: never a payload, a comment or
// any other text an agent wrote, so the ledger can't leak or replay them.

import { bytesToHex, canonicalJson, encodeUtf8, type Sha256 } from "@halonicjs/std";

/** What a rule would have done with an approval. Shadow mode never acts on it. */
export type ShadowOutcome = "no_decision" | "would_approve";

/** The `previousHash` of the first entry in a ledger. */
export const genesisHash = "sha256:genesis";

/**
 * What the evaluator saw and concluded about one approval. The raw payload
 * and comments are only hashed; they never reach the entry.
 */
export interface LedgerInput {
  readonly approvalId: string;
  /** The approval's payload as read from Paperclip; only its hash is kept. */
  readonly payload: unknown;
  /** The approval's comments; only their hash is kept. */
  readonly comments: readonly string[];
  readonly outcome: ShadowOutcome;
  /** A reason code such as `card.touched`, never free text. */
  readonly reason: string;
  readonly ruleId?: string;
  readonly ruleVersion?: number;
}

/** One line of the ledger, linked to the one before it by `previousHash`. */
export interface LedgerEntry {
  /** 0 for the first entry, then one more for each entry. */
  readonly index: number;
  /** The `hash` of the entry before, or {@link genesisHash} for the first. */
  readonly previousHash: string;
  /** When the entry was written, as an ISO 8601 UTC time. */
  readonly at: string;
  readonly approvalId: string;
  readonly payloadHash: string;
  readonly commentsHash: string;
  readonly outcome: ShadowOutcome;
  readonly reason: string;
  readonly ruleId?: string;
  readonly ruleVersion?: number;
  /** The SHA-256 of every other field, in canonical JSON. */
  readonly hash: string;
}

const outcomes: readonly ShadowOutcome[] = ["no_decision", "would_approve"];

// Ids and reason codes: letters, digits and a few separators, no spaces. This
// keeps a caller from passing a sentence (or a payload) where a code belongs.
const codePattern = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Builds the entry that follows `previous` in the chain.
 *
 * @param previous - the ledger's last entry, or `null` for an empty ledger
 * @param input - the evaluation to record
 * @param at - when it is written
 * @param digest - SHA-256, passed in because the core has no hash code
 * @throws TypeError when an id or reason isn't a plain code, or the outcome is unknown
 */
export async function chainEntry(
  previous: LedgerEntry | null,
  input: LedgerInput,
  at: Date,
  digest: Sha256,
): Promise<LedgerEntry> {
  checkInput(input);
  const fields: Omit<LedgerEntry, "hash"> = {
    index: previous === null ? 0 : previous.index + 1,
    previousHash: previous === null ? genesisHash : previous.hash,
    at: at.toISOString(),
    approvalId: input.approvalId,
    payloadHash: await hashOf(input.payload ?? null, digest),
    commentsHash: await hashOf(input.comments, digest),
    outcome: input.outcome,
    reason: input.reason,
    ...(input.ruleId === undefined ? {} : { ruleId: input.ruleId }),
    ...(input.ruleVersion === undefined ? {} : { ruleVersion: input.ruleVersion }),
  };
  return { ...fields, hash: await hashOf(fields, digest) };
}

/** Whether a chain reads whole, or the index of the first entry that doesn't. */
export type ChainCheck = { readonly ok: true } | { readonly ok: false; readonly at: number };

/**
 * Checks every entry's index, its link to the entry before and its own hash.
 * An entry edited, inserted, removed or moved inside the chain fails at the
 * first entry that no longer fits. The chain is checked against nothing
 * outside it, so entries cut from the end, or an edit with every later entry
 * rehashed, still pass.
 *
 * @param entries - the ledger's entries, oldest first, as read from a store
 * @param digest - SHA-256
 */
export async function verifyChain(
  entries: readonly LedgerEntry[],
  digest: Sha256,
): Promise<ChainCheck> {
  let previousHash = genesisHash;
  for (const [position, entry] of entries.entries()) {
    const { hash, ...fields } = entry;
    const fits =
      entry.index === position &&
      entry.previousHash === previousHash &&
      hash === (await hashOf(fields, digest));
    if (!fits) return { ok: false, at: position };
    previousHash = hash;
  }
  return { ok: true };
}

async function hashOf(value: unknown, digest: Sha256): Promise<string> {
  return `sha256:${bytesToHex(await digest.sha256(encodeUtf8(canonicalJson(value))))}`;
}

function checkInput(input: LedgerInput): void {
  checkCode("approvalId", input.approvalId);
  checkCode("reason", input.reason);
  if (input.ruleId !== undefined) checkCode("ruleId", input.ruleId);
  if (!outcomes.includes(input.outcome)) {
    throw new TypeError(`A ledger entry needs a known outcome, got "${String(input.outcome)}".`);
  }
  const version = input.ruleVersion;
  if (version !== undefined && !(Number.isSafeInteger(version) && version >= 0)) {
    throw new TypeError("A ledger entry's ruleVersion must be a whole number of 0 or more.");
  }
}

function checkCode(field: string, value: string): void {
  // The message names the field only: the value may be text an agent wrote.
  if (typeof value !== "string" || !codePattern.test(value)) {
    throw new TypeError(
      `A ledger entry's ${field} must be a plain code (letters, digits, . _ : -).`,
    );
  }
}
