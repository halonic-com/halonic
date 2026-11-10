import { assertNever, type ErrorKind, errorKindOf } from "@halonicjs/std";
import { copyDetailsWords } from "./copy-details-words.ts";

/**
 * What a screen tells the user when something failed and it has no more
 * specific text of its own (microcopy 22, F13). The title is the screen's
 * "Couldn't…" sentence; the error's kind decides the body and the action.
 */
export interface ErrorMessage {
  readonly kind: ErrorKind;
  readonly title: string;
  /** The reason, shown after the title. Never an `internal` error's own message. */
  readonly body: string;
  /** The one next step, when there is one. */
  readonly action?: ErrorAction;
}

/**
 * The next step a message offers. The screen wires up the handler: for
 * `try-again` it repeats the same action, not a page reload.
 */
export type ErrorAction =
  | { readonly id: "go-to"; readonly label: string; readonly place: string }
  | { readonly id: "load-latest"; readonly label: string }
  | { readonly id: "sign-in"; readonly label: string }
  | { readonly id: "log-in"; readonly label: string }
  | { readonly id: "open-rule"; readonly label: string; readonly rule: RulePlace }
  | { readonly id: "try-again"; readonly label: string }
  | { readonly id: "change-budget"; readonly label: string }
  | { readonly id: "copy-details"; readonly label: string };

/** Where a `denied` error's rule is set, when the user can change it. */
export type RulePlace = "trust" | "connector";

/** What the screen knows about the failed action, beyond the error itself. */
export interface ErrorContext {
  /** The screen's own "Couldn't…" sentence, such as "Couldn't save Support reply." */
  readonly title: string;
  /** For `not_found`: the missing item's kind and the list it lives in, such as agent and Agents. */
  readonly item?: { readonly kindName: string; readonly place: string };
  /**
   * For `unauthenticated`, `unavailable` and `limit_reached`: the outside
   * service the error came from, such as "Gmail (fin@acme.example)" with
   * "Sign in with Google", or "Anthropic" without a sign-in.
   */
  readonly service?: { readonly name: string; readonly signIn?: string };
  /** For `unauthenticated` without a service: this Studio is served, so its own login expired. */
  readonly served?: boolean;
  /** For `conflict`: the item has unsaved edits, which Load the latest would lose. */
  readonly hasUnsavedEdits?: boolean;
  /** For `denied`: where the rule that said no is set. */
  readonly rule?: RulePlace;
  /** For `limit_reached`: the limit is Halonic's own spend budget, not the service's. */
  readonly ownBudget?: boolean;
  /** For `limit_reached` from a service: how long until it can be tried again, when known. */
  readonly retryAfterMs?: number;
}

/** The approved words (microcopy 22 F13, failure-states 4.1, HAL-1720). */
const words = {
  notFound: (kindName: string) => `This ${kindName} isn't in this workspace any more.`,
  goTo: (place: string) => `Go to ${place}`,
  changedElsewhere: "It was changed somewhere else since you opened it.",
  loadLatest: "Load the latest",
  signedOut: (service: string) => `${service} is signed out.`,
  loggedOut: "You've been logged out of this Studio.",
  logIn: "Log in",
  ruleLabels: { trust: "Open trust", connector: "Open connector" } satisfies Record<
    RulePlace,
    string
  >,
  slowDown: (service: string) => `${service} asked Halonic to slow down.`,
  tryAgainIn: (minutes: number) =>
    `Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
  changeBudget: "Change budget",
  noAnswer: (service: string) => `${service} didn't answer. It may be offline or busy.`,
  tryAgain: "Try again",
  cantExplain: "Halonic ran into a problem it can't explain yet.",
  copyDetails: copyDetailsWords.label,
} as const;

/**
 * The message for a failed action, from the error's kind. This is the one
 * place the Studio turns an error kind into words (rule 4 of the
 * failure-path guide); a screen's own text for a failure always wins over it.
 *
 * A kinded error's message is safe to show (HAL-1663), so it is the reason
 * when the screen gives nothing more specific. An `internal` error, which is
 * anything without a kind, never shows its message: that goes only into Copy
 * details and the log.
 *
 * @example
 * errorMessageFor(new KindedError("conflict", "The run changed."), { title: "Couldn't save Support reply." });
 * // { kind: "conflict", title: "Couldn't save Support reply.", body: "The run changed.",
 * //   action: { id: "load-latest", label: "Load the latest" } }
 */
export function errorMessageFor(error: unknown, context: ErrorContext): ErrorMessage {
  const kind = errorKindOf(error);
  const reason = kindedMessageOf(error);
  const { title } = context;
  switch (kind) {
    case "invalid_input":
      return { kind, title, body: reason };
    case "not_found":
      return notFound(context, reason);
    case "conflict":
      return conflict(context, reason);
    case "unauthenticated":
      return unauthenticated(context, reason);
    case "denied":
      return denied(context, reason);
    case "limit_reached":
      return limitReached(context, reason);
    case "unavailable":
      return unavailable(context, reason);
    case "internal":
      return {
        kind,
        title,
        body: words.cantExplain,
        action: action("copy-details", words.copyDetails),
      };
    default:
      return assertNever(kind, "error kind");
  }
}

function notFound({ title, item }: ErrorContext, reason: string): ErrorMessage {
  if (item === undefined) {
    return { kind: "not_found", title, body: reason };
  }
  const gone = itemGoneWords(item);
  return {
    kind: "not_found",
    title,
    body: gone.sentence,
    action: { id: "go-to", label: gone.goTo, place: item.place },
  };
}

/**
 * What an item that isn't there any more is called, one pattern for every kind (microcopy 2
 * "Item gone" and 22 F13 `not_found`): "This agent isn't in this workspace any more." and
 * "Go to Agents".
 */
export function itemGoneWords(item: { readonly kindName: string; readonly place: string }): {
  readonly sentence: string;
  readonly goTo: string;
} {
  return { sentence: words.notFound(item.kindName), goTo: words.goTo(item.place) };
}

/**
 * Load the latest drops the item's edit, so it is offered only when there is
 * none to lose (FR6, HAL-1846). With unsaved edits the screen's own conflict
 * text, such as Keep mine / Load theirs for a file, is the way out.
 */
function conflict({ title, hasUnsavedEdits }: ErrorContext, reason: string): ErrorMessage {
  const body = reason === "" ? words.changedElsewhere : reason;
  if (hasUnsavedEdits === true) {
    return { kind: "conflict", title, body };
  }
  return { kind: "conflict", title, body, action: action("load-latest", words.loadLatest) };
}

function unauthenticated({ title, service, served }: ErrorContext, reason: string): ErrorMessage {
  if (service !== undefined) {
    const signIn = service.signIn === undefined ? undefined : action("sign-in", service.signIn);
    return withAction(
      { kind: "unauthenticated", title, body: words.signedOut(service.name) },
      signIn,
    );
  }
  if (served === true) {
    return {
      kind: "unauthenticated",
      title,
      body: words.loggedOut,
      action: action("log-in", words.logIn),
    };
  }
  return { kind: "unauthenticated", title, body: reason };
}

function denied({ title, rule }: ErrorContext, reason: string): ErrorMessage {
  const message: ErrorMessage = { kind: "denied", title, body: reason };
  if (rule === undefined) {
    return message;
  }
  return withAction(message, { id: "open-rule", label: words.ruleLabels[rule], rule });
}

function limitReached(context: ErrorContext, reason: string): ErrorMessage {
  const { title, service, ownBudget, retryAfterMs } = context;
  if (ownBudget === true) {
    return {
      kind: "limit_reached",
      title,
      body: reason,
      action: action("change-budget", words.changeBudget),
    };
  }
  const tryAgain = action("try-again", words.tryAgain);
  if (service === undefined) {
    return { kind: "limit_reached", title, body: reason, action: tryAgain };
  }
  const slowDown = words.slowDown(service.name);
  const body =
    retryAfterMs === undefined
      ? slowDown
      : `${slowDown} ${words.tryAgainIn(minutesFrom(retryAfterMs))}`;
  return { kind: "limit_reached", title, body, action: tryAgain };
}

function unavailable({ title, service }: ErrorContext, reason: string): ErrorMessage {
  const body = service === undefined ? reason : words.noAnswer(service.name);
  return { kind: "unavailable", title, body, action: action("try-again", words.tryAgain) };
}

/** The message of a kinded error. `errorKindOf` only gives a kind to errors with a string message. */
function kindedMessageOf(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "";
}

/** Whole minutes, rounded up, so "Try again in 1 minute" is never too early. */
function minutesFrom(milliseconds: number): number {
  return Math.max(1, Math.ceil(milliseconds / 60_000));
}

/** The actions that need nothing but their label. */
type LabelOnlyActionId = Exclude<ErrorAction["id"], "go-to" | "open-rule">;

function action<Id extends LabelOnlyActionId>(
  id: Id,
  label: string,
): { readonly id: Id; readonly label: string } {
  return { id, label };
}

function withAction(message: ErrorMessage, next: ErrorAction | undefined): ErrorMessage {
  return next === undefined ? message : { ...message, action: next };
}
