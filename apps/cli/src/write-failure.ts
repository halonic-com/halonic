import { type ErrorKind, KindedError } from "@halonicjs/std";
import type { Message } from "./messages/define.ts";
import { fileMessages } from "./messages/files.ts";
import { plainText } from "./messages/phrase.ts";

/** Why a write failed, in the words of failure-states FS8 and cli-output 3.1. */
interface WriteReason {
  /** The detailed code on line 3 and in `--json`. */
  readonly code: string;
  readonly kind: ErrorKind;
  readonly reason: Message;
  readonly fix?: Message;
}

const diskFull: WriteReason = {
  code: "disk-full",
  kind: "limit_reached",
  reason: fileMessages.diskFull(),
  fix: fileMessages.diskFullFix(),
};
const notWritable: WriteReason = {
  code: "not-writable",
  kind: "denied",
  reason: fileMessages.notWritable(),
};
const inUse: WriteReason = { code: "in-use", kind: "conflict", reason: fileMessages.inUse() };

/**
 * Node's write error codes by reason, as Studio's save errors read them.
 * `EBUSY` is what Node reports for a Windows sharing violation.
 */
const reasonByCode: Readonly<Record<string, WriteReason>> = {
  ENOSPC: diskFull,
  EDQUOT: diskFull,
  EACCES: notWritable,
  EPERM: notWritable,
  EROFS: notWritable,
  EBUSY: inUse,
};

/** A write that failed for a reason the user can act on: its sentence, its fix and its kind. */
export class WriteFailedError extends KindedError {
  /** The detailed code on line 3 and in `--json`, such as `disk-full`. */
  readonly code: string;

  constructor(reason: WriteReason, cause: unknown) {
    super(reason.kind, plainText(reason.reason.phrase), {
      ...(reason.fix === undefined ? {} : { fix: plainText(reason.fix.phrase) }),
      cause,
    });
    this.code = reason.code;
  }
}

/**
 * The error a failed write ends the command with: a {@link WriteFailedError}
 * when Node's code says why (the disk is full, the folder can't be written,
 * another app holds the file), else the error itself, which the CLI shows as
 * a bug with its details under `--debug`.
 *
 * @example
 * throw writeFailure(Object.assign(new Error("no space left on device"), { code: "ENOSPC" }));
 * // ✕ Couldn't create the workspace in ./acme: the disk is full.
 * //   Free some space, then run it again.
 */
export function writeFailure(error: unknown): unknown {
  const code = codeOf(error);
  const reason =
    code !== undefined && Object.hasOwn(reasonByCode, code) ? reasonByCode[code] : undefined;
  return reason === undefined ? error : new WriteFailedError(reason, error);
}

function codeOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}
