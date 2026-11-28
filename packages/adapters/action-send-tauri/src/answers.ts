// Reads the shell's answers. Each is rebuilt field by field from an
// allow-list, and an answer with any other field is refused as malformed, so
// nothing the shell might add later (a header, a token) reaches the page by
// accident.
import { maxActionErrorLength } from "@halonicjs/events";
import type {
  ActionAccount,
  ActionOpenResult,
  ActionRefusal,
  ActionSendResult,
  ActionService,
  ActionSignInResult,
  ActionValue,
} from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";
import { ActionShellError, malformedAnswer } from "./action-shell-error.ts";
import { type ActionUserCode, actionCommands } from "./shell.ts";

const refusals: readonly ActionRefusal[] = [
  "not-in-catalog",
  "bad-value",
  "signed-out",
  "too-often",
];

/** Whether `value` has no key but `outcome` and `others`; it may lack any of them. */
function hasOnlyKeys(value: Record<string, unknown>, ...others: readonly string[]): boolean {
  const allowed = new Set(["outcome", ...others]);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isRefusal(value: unknown): value is ActionRefusal {
  return refusals.some((refusal) => refusal === value);
}

function isActionValue(value: unknown): value is ActionValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function refusedOf(
  answer: Record<string, unknown>,
): { outcome: "refused"; reason: ActionRefusal } | undefined {
  const { reason } = answer;
  if (!hasOnlyKeys(answer, "reason") || !isRefusal(reason)) return undefined;
  return { outcome: "refused", reason };
}

function keptOf(value: unknown): Record<string, ActionValue> | undefined {
  if (!isPlainObject(value)) return undefined;
  const kept: Record<string, ActionValue> = {};
  for (const [name, field] of Object.entries(value)) {
    if (!isActionValue(field)) return undefined;
    kept[name] = field;
  }
  return kept;
}

/**
 * A `more-than-one` answer as the port names it: a successful status, nothing kept and no error
 * text, so nothing the shell or the service wrote can ride along with it.
 */
function unusableOf(
  status: number,
  kept: Readonly<Record<string, ActionValue>>,
  answer: Record<string, unknown>,
): ActionSendResult | undefined {
  const isSuccess = status >= 200 && status < 300;
  if (answer["unusable"] !== "more-than-one" || !isSuccess) return undefined;
  if (Object.keys(kept).length > 0 || answer["error"] !== undefined) return undefined;
  return { outcome: "answered", status, kept, unusable: "more-than-one" };
}

function answeredOf(answer: Record<string, unknown>): ActionSendResult | undefined {
  const { status, error } = answer;
  const kept = keptOf(answer["kept"]);
  const isStatus =
    Number.isInteger(status) && (status as number) >= 100 && (status as number) <= 599;
  const known = hasOnlyKeys(answer, "status", "kept", "error", "unusable");
  if (!known || !isStatus || kept === undefined) return undefined;
  if (answer["unusable"] !== undefined) return unusableOf(status as number, kept, answer);
  const result: ActionSendResult = { outcome: "answered", status: status as number, kept };
  if (error === undefined) return result;
  if (typeof error !== "string") return undefined;
  // The shell caps it already; capping again costs nothing if it ever doesn't.
  result.error = error.slice(0, maxActionErrorLength);
  return result;
}

function sendResultOf(answer: unknown): ActionSendResult | undefined {
  if (!isPlainObject(answer)) return undefined;
  const { outcome } = answer;
  switch (outcome) {
    case "answered":
      return answeredOf(answer);
    case "refused":
      return refusedOf(answer);
    case "cancelled":
    case "unreachable":
      return hasOnlyKeys(answer) ? { outcome } : undefined;
    default:
      return undefined;
  }
}

/** `action_send`'s answer, or a `malformed-answer` error. */
export function readSendResult(answer: unknown): ActionSendResult {
  const result = sendResultOf(answer);
  if (result === undefined) throw malformedAnswer(actionCommands.send);
  return result;
}

/**
 * `action_open_guided`'s or `action_open_page`'s answer. The shell's
 * `not-opened`, where the checks passed but the browser didn't open the
 * page, has no place in the port, so it is an {@link ActionShellError}.
 */
export function readOpenResult(command: string, answer: unknown): ActionOpenResult {
  if (!isPlainObject(answer)) throw malformedAnswer(command);
  const { outcome } = answer;
  if (outcome === "opened" && hasOnlyKeys(answer)) return { outcome };
  const refused = outcome === "refused" ? refusedOf(answer) : undefined;
  if (refused !== undefined) return refused;
  if (outcome === "not-opened" && hasOnlyKeys(answer)) {
    throw new ActionShellError("not-opened", "The browser didn't open the page.");
  }
  throw malformedAnswer(command);
}

/** `action_account`'s answer for `service`: its name only, or `undefined` when nobody is signed in. */
export function readAccount(service: ActionService, answer: unknown): ActionAccount | undefined {
  if (answer === null) return undefined;
  const account = accountOf(service, answer);
  if (account === undefined) throw malformedAnswer(actionCommands.account);
  return account;
}

function accountOf(service: ActionService, value: unknown): ActionAccount | undefined {
  if (!isPlainObject(value) || Object.keys(value).length !== 2) return undefined;
  const { name } = value;
  if (value["service"] !== service || typeof name !== "string" || name === "") return undefined;
  return { service, name };
}

/**
 * `action_sign_in`'s answer. The shell's `failed`, with its sentence for the
 * user, has no place in the port, so it is an {@link ActionShellError}.
 */
export function readSignInResult(service: ActionService, answer: unknown): ActionSignInResult {
  if (!isPlainObject(answer)) throw malformedAnswer(actionCommands.signIn);
  const { outcome, reason } = answer;
  const account = outcome === "signed-in" ? accountOf(service, answer["account"]) : undefined;
  if (account !== undefined && hasOnlyKeys(answer, "account")) {
    return { outcome: "signed-in", account };
  }
  if ((outcome === "cancelled" || outcome === "not-available") && hasOnlyKeys(answer)) {
    return { outcome };
  }
  if (outcome === "failed" && hasOnlyKeys(answer, "reason") && typeof reason === "string") {
    throw new ActionShellError("sign-in-failed", reason);
  }
  throw malformedAnswer(actionCommands.signIn);
}

/** A device code the shell sent over the sign-in's channel, or `undefined` if it isn't one. */
export function readUserCode(message: unknown): ActionUserCode | undefined {
  if (!isPlainObject(message) || Object.keys(message).length !== 3) return undefined;
  const { code, page, expiresIn } = message;
  if (typeof code !== "string" || code === "" || typeof page !== "string") return undefined;
  if (!page.startsWith("https://") || !Number.isSafeInteger(expiresIn)) return undefined;
  return { code, page, expiresIn: expiresIn as number };
}

/** A sign-out's answer: Rust's `()`, which reaches the page as `null`. Anything else is malformed. */
export function readNothing(command: string, answer: unknown): void {
  if (answer !== null) throw malformedAnswer(command);
}
