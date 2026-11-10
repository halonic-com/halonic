import type { Message } from "./messages/define.ts";
import { type Phrase, plainText } from "./messages/phrase.ts";

/** What a {@link NotTrustedError} says and shows. */
export interface NotTrustedDetails {
  /** The reason, such as "Acme isn't trusted on this computer yet." */
  readonly problem: Message;
  /** The one next step, such as "Review what it can start, then trust it: halonic trust". */
  readonly fix: Message;
  /** The full fingerprint of what the workspace holds now: `hfp1:` and 64 hex characters, never shortened. */
  readonly fingerprint: string;
  /**
   * The trust check's lines, shown on stderr before the ✕ line so the person
   * sees what they would trust. Empty when the command shows no check.
   */
  readonly check: readonly Phrase[];
  /**
   * What line 1 says it couldn't do, before the problem. Left out, it's the
   * command's own action ("✕ Couldn't run support-reply: …"). `trust` names
   * the workspace instead ("✕ Couldn't trust Acme: …"), and passes `null`
   * when the problem is line 1 on its own, as its no-terminal refusal
   * (cli-output 1.7).
   */
  readonly action?: Message | null;
}

/**
 * The workspace isn't trusted on this computer, so the command started
 * nothing and wrote nothing to the run log (`cli.not-trusted`). Every command
 * that needs trust throws this one error, so they all end the same way: the
 * check and the ✕ lines on stderr, the bare fingerprint as the last stdout
 * line, so `tail -n1` gives what `--fingerprint` takes, and exit code 3.
 *
 * Its kind is the CLI's own `not_trusted`, not one of `std`'s error kinds:
 * exit code 3 belongs to the CLI (see `exitCodeOfError`).
 *
 * @example
 * throw new NotTrustedError({
 *   problem: trustMessages.notTrustedYet("Acme"),
 *   fix: trustMessages.reviewThenTrust(dir),
 *   fingerprint: check.fingerprint,
 *   check: [],
 * });
 */
export class NotTrustedError extends Error {
  override readonly name = "NotTrustedError";
  readonly kind = "not_trusted";
  /** The detailed code on line 3 and in `--json`, the same as the run's `not-trusted` step reason. */
  readonly code = "not-trusted";
  readonly problem: Message;
  readonly fixMessage: Message;
  readonly fingerprint: string;
  readonly check: readonly Phrase[];
  readonly action: Message | null | undefined;

  constructor(details: NotTrustedDetails) {
    super(plainText(details.problem.phrase));
    this.problem = details.problem;
    this.fixMessage = details.fix;
    this.fingerprint = details.fingerprint;
    this.check = details.check;
    this.action = details.action;
  }
}
