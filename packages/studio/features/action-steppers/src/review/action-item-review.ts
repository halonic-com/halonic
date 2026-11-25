/**
 * Turns an action Inbox item into the stepper screen's view in review mode (HAL-17528): the user
 * sees what it touches, each step and who asked, but nothing runs until the desktop shell can make
 * the calls (HAL-17535). Every check here runs again when the user opens the item, whatever the
 * engine or the provider already checked (HAL-17491 7.3).
 */
import {
  type AttestedSource,
  decideRequester,
  type RequesterPolicy,
  type Step,
  type StepperCatalog,
  type StepperDefinition,
  type StepperRisk,
  type StepperTarget,
  stepperRequestFormat,
  validateStepperRequest,
} from "@halonicjs/action-steppers";
import type {
  InboxActionRequest,
  InboxItem,
  MessagingAuthor,
  MessagingSource,
} from "@halonicjs/ports";
import { parse } from "@halonicjs/schema-kit";
import { markHiddenName } from "@halonicjs/std";
import type {
  StepAction,
  StepperStage,
  StepperTouch,
  StepperView,
  StepView,
} from "../stepper-view.ts";
import { serviceName } from "../ui/stepper-words.ts";

/** An Inbox item that asks the user to run a stepper. */
export type ActionItem = InboxItem & { readonly action: InboxActionRequest };

/** What the review checks an item against: the installed catalog, the user's policy and the time. */
export interface ActionReviewContext {
  readonly catalog: StepperCatalog;
  /** The deciding policy from the user's profile, never from a workspace (HAL-17491 6.5). */
  readonly policy: RequesterPolicy;
  readonly now: Date;
}

/**
 * The review of one action item: the stepper screen's view, or why Halonic can't read the request,
 * one reason per problem. An unreadable request shows as a normal card with its reasons.
 */
export type ActionItemReview =
  | { readonly kind: "stepper"; readonly view: StepperView }
  | { readonly kind: "unreadable"; readonly reasons: readonly string[] };

/** An item names one definition, so it is checked as a request with one `use` block. */
function requestDocument(action: InboxActionRequest): string {
  const reference = `${action.definition}@${action.version}`;
  return JSON.stringify({
    format: stepperRequestFormat,
    // The screen's title comes from the definition and its reason from the item, never from here.
    title: reference,
    reason: "",
    blocks: [{ kind: "use", ref: reference, parameters: action.parameters }],
  });
}

/** The reasons as the card says them: the item has one block, so "block 1: " says nothing. */
function itemReasons(reasons: readonly string[]): string[] {
  return reasons.map((reason) => reason.replace(/^block 1: /, ""));
}

/**
 * The source as the `AgentMessaging` provider attests it, which the policy keys on. A provider the
 * policy has no kind for is attested by no one, and the user can't have allowed it.
 */
function attestedSource(source: MessagingSource | undefined): AttestedSource | undefined {
  const provider = source?.provider;
  if (source === undefined || (provider !== "paperclip" && provider !== "halonic")) {
    return undefined;
  }
  return { kind: provider, id: source.id };
}

/** Whether the user's policy lets this item's source ask for a request of this risk. */
function policyAllows(
  item: ActionItem,
  source: MessagingSource | undefined,
  risk: StepperRisk,
  policy: RequesterPolicy,
): boolean {
  if (risk === "routine") return true;
  const attested = attestedSource(source);
  if (attested === undefined) return false;
  // The agent's name is a claim within its source, so a rule naming an agent only narrows.
  const claimed = item.from.kind === "agent" ? item.from.name : undefined;
  return decideRequester(policy, attested, claimed, risk) === "allowed";
}

/** A template's `{name}` placeholders filled from the checked parameters, encoded in an address. */
function fill(template: string, parameters: InboxActionRequest["parameters"], encode: boolean) {
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (whole, name: string) => {
    const value = parameters[name];
    if (value === undefined) return whole;
    return encode ? encodeURIComponent(String(value)) : String(value);
  });
}

/** `2026-11-24` as that day in local time, so the label reads the same day in every time zone. */
function localDay(day: string): Date {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

function stepAction(step: Step, parameters: InboxActionRequest["parameters"]): StepAction {
  switch (step.kind) {
    case "guided":
      return {
        kind: "browser",
        address: fill(step.address, parameters, true),
        instructions: step.instructions.map((line) => fill(line, parameters, false)),
        source: { kind: "library", checkedOn: localDay(step.checkedOn) },
        resultLabel: step.result?.label,
      };
    case "input":
      return { kind: "input", label: step.label, secret: step.secret };
    case "script":
      return { kind: "script", script: step.ref };
  }
}

function stepViews(
  definition: StepperDefinition,
  previews: readonly string[],
  parameters: InboxActionRequest["parameters"],
): StepView[] {
  return definition.steps.map((step, index) => {
    const action = stepAction(step, parameters);
    return {
      number: index + 1,
      preview: previews[index] ?? definition.summary,
      risk: definition.risk,
      action,
      manual:
        action.kind === "browser"
          ? { address: action.address, lines: action.instructions }
          : { lines: [] },
      hasCheck: false,
      outcome: { kind: "pending" },
    };
  });
}

function touchOf(target: StepperTarget): StepperTouch {
  if (target.kind === "page") return { kind: "page", address: `https://${target.name}` };
  return {
    kind: "target",
    service: serviceName(target.service),
    target: `${target.kind} ${target.name}`,
  };
}

function requesterName(author: MessagingAuthor): string {
  return author.kind === "me" ? "You" : markHiddenName(author.name);
}

/**
 * Reviews an action item the user opened (`action-steppers.review-mode`): checks its request
 * against the installed catalog with `validateStepperRequest`, applies the user's requester policy
 * to the source the provider attests, and builds the screen's view. The stage is `expired` past
 * the request's expiry, `blocked` when the policy doesn't allow its risk from that source, and
 * otherwise `desktop-only`, since steps run only once the desktop shell is wired (HAL-17535).
 *
 * @param source - the item's source as `AgentMessaging` lists it; `undefined` when it isn't listed
 * @returns the screen's view, or the reasons the request can't be read
 *
 * @example
 * const review = reviewActionItem(item, source, { catalog, policy, now: new Date() });
 * if (review.kind === "unreadable") showReasons(review.reasons); // ["`github.delete-repo@1` isn't in this Halonic's catalog"]
 */
export function reviewActionItem(
  item: ActionItem,
  source: MessagingSource | undefined,
  context: ActionReviewContext,
): ActionItemReview {
  const { action } = item;
  const checked = validateStepperRequest(requestDocument(action), context.catalog);
  if (!checked.ok) return { kind: "unreadable", reasons: itemReasons(checked.error) };
  const definition = context.catalog.definition(action.definition, action.version);
  const parsed =
    definition === undefined ? undefined : parse(definition.parameters, action.parameters);
  // The validator found and parsed both, so this only guards against a catalog that changed between.
  if (definition === undefined || parsed === undefined || !parsed.ok) {
    return { kind: "unreadable", reasons: [`\`${action.definition}@${action.version}\` changed`] };
  }
  const expiresAt = new Date(action.expires);
  if (Number.isNaN(expiresAt.getTime())) {
    return { kind: "unreadable", reasons: ["its expiry isn't a date and time"] };
  }
  const { risk, touches } = checked.value;
  let stage: StepperStage = { kind: "desktop-only" };
  if (!policyAllows(item, source, risk, context.policy)) stage = { kind: "blocked" };
  if (expiresAt.getTime() <= context.now.getTime()) stage = { kind: "expired" };
  const view: StepperView = {
    title: definition.title,
    service: definition.service,
    account: null,
    touches: touches.flatMap((touch) => touch.targets).map(touchOf),
    risk,
    expiresAt,
    requester: { name: requesterName(item.from), source: source?.label ?? "an unknown source" },
    reason: item.question,
    steps: stepViews(definition, definition.preview(parsed.value), action.parameters),
    serviceDown: false,
    stage,
  };
  return { kind: "stepper", view };
}
