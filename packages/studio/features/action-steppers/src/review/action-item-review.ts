/**
 * Turns an action Inbox item into the stepper screen's view in review mode (HAL-17528): the user
 * sees what it touches, each step and who asked. In the desktop app the stepper run takes it from
 * there (`run/stepper-run.ts`). Every check here runs again when the user opens the item and
 * before each step, whatever the engine or the provider already checked (HAL-17491 7.3).
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
import type { ActionKeptValue } from "@halonicjs/events";
import type {
  ActionCallRoute,
  ActionRoute,
  InboxActionRequest,
  InboxItem,
  MessagingAuthor,
  MessagingSource,
} from "@halonicjs/ports";
import { parse } from "@halonicjs/schema-kit";
import { markHiddenName } from "@halonicjs/std";
import { pageBody } from "../run/step-request.ts";
import type {
  InstructionsSource,
  StepAction,
  StepperStage,
  StepperTouch,
  StepperView,
  StepView,
} from "../stepper-view.ts";
import { serviceName } from "../ui/stepper-words.ts";
import { bindPaperclipHost, type ConnectionsRead, noConnections } from "./paperclip-host.ts";

/** An Inbox item that asks the user to run a stepper. */
export type ActionItem = InboxItem & { readonly action: InboxActionRequest };

/** What the review checks an item against: the installed catalog, the user's policy and the time. */
export interface ActionReviewContext {
  readonly catalog: StepperCatalog;
  /** The deciding policy from the user's profile, never from a workspace (HAL-17491 6.5). */
  readonly policy: RequesterPolicy;
  readonly now: Date;
  /**
   * What the request's `check` steps kept, from its record, once one has run: the previews set
   * today's state next to the change, such as "Required reviews on `main` today: 1. After: 2."
   */
  readonly current?: Readonly<Record<string, ActionKeptValue>> | undefined;
  /**
   * The connections as this window read them: a Paperclip request runs only on the host of one
   * whose key this computer holds. Without them, none does (`action-steppers.paperclip-host`).
   * While they are still being read, the review neither refuses the request nor lets it run.
   */
  readonly paperclips?: ConnectionsRead | undefined;
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
export function policyAllows(
  item: InboxItem,
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

/**
 * `2026-11-24` as that day in local time, so the label reads the same day in every time zone, or
 * `undefined` for anything that isn't a real day.
 */
function localDay(day: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (match === null) return undefined;
  const [year, month, date] = match.slice(1).map(Number) as [number, number, number];
  const at = new Date(year, month - 1, date);
  // `2026-02-31` rolls over into March: that is no day the catalog meant.
  if (at.getMonth() !== month - 1 || at.getDate() !== date) return undefined;
  return at;
}

/** Where a guided step's instructions come from, by its `checkedOn`: a day, `from docs`, or neither. */
function librarySource(checkedOn: string): InstructionsSource {
  if (checkedOn === "from docs") return { kind: "docs" };
  const day = localDay(checkedOn);
  return day === undefined ? { kind: "unchecked" } : { kind: "library", checkedOn: day };
}

/**
 * A call step as "Show the request" shows it: the route's method, its path with the parameters
 * filled in, and the body fields the page sends (`step` names a list field's parameter). The shell
 * adds constants and the values typed in its own dialog, so those never show here.
 */
function callAction(
  route: ActionCallRoute,
  parameters: InboxActionRequest["parameters"],
  step: Step,
): StepAction {
  const body = pageBody(route, parameters, step);
  return {
    kind: "call",
    call: {
      method: route.method,
      address: fill(route.path, parameters, true),
      body: Object.keys(body).length === 0 ? undefined : JSON.stringify(body),
    },
  };
}

function stepAction(
  step: Step,
  parameters: InboxActionRequest["parameters"],
  route: ActionRoute | undefined,
): StepAction {
  switch (step.kind) {
    case "guided":
      return {
        kind: "browser",
        address: fill(step.address, parameters, true),
        instructions: step.instructions.map((line) => fill(line, parameters, false)),
        source: librarySource(step.checkedOn),
        resultLabel: step.result?.label,
        resultPattern: step.result?.pattern,
      };
    case "input":
      return { kind: "input", label: step.label, secret: step.secret };
    case "call":
    case "check": {
      if (route?.kind === "call") return callAction(route, parameters, step);
      // A catalog without routes still shows where the step goes; the shell sends nothing off its own list.
      const method = step.kind === "check" ? "GET" : step.method;
      return { kind: "call", call: { method, address: fill(step.path, parameters, true) } };
    }
    case "sign-in":
      return { kind: "sign-in", phase: step.phase };
    case "script":
      // A script step runs once the catalog has its call route; until then the review names it.
      return route?.kind === "call"
        ? callAction(route, parameters, step)
        : { kind: "script", script: step.ref };
  }
}

function stepViews(
  definition: StepperDefinition,
  previews: readonly string[],
  parameters: InboxActionRequest["parameters"],
  catalog: StepperCatalog,
): StepView[] {
  return definition.steps.map((step, index) => {
    const route = catalog.route(definition.id, definition.version, index + 1);
    const action = stepAction(step, parameters, route);
    return {
      number: index + 1,
      preview: previews[index] ?? definition.summary,
      risk: definition.risk,
      action,
      manual:
        action.kind === "browser"
          ? { address: action.address, lines: action.instructions }
          : { lines: [] },
      // A check that confirms a step done by hand; a definition's own `check` step is a step of its
      // own that runs like any other. No definition has a by-hand check yet (HAL-17491 7.8).
      hasCheck: false,
      outcome: { kind: "pending" },
    };
  });
}

/** What the review adds to a sign-in's Paperclip, so an unfamiliar address stands out. */
export const fromConnectionFile = "from this workspace's connection file";

/**
 * One line of what the request touches. A sign-in's Paperclip is the address its connection file
 * names, which the host binding has checked by then: the file is what the user trusts, not the
 * request (Julian's review on HAL-17545). It leaves out the kind, which only repeats the service
 * there ("Paperclip: Paperclip …", Nina's copy check on HAL-20477).
 */
function touchOf(target: StepperTarget, signsIn: boolean): StepperTouch {
  if (target.kind === "page") return { kind: "page", address: `https://${target.name}` };
  const service = serviceName(target.service);
  if (signsIn && target.kind === "Paperclip") {
    return { kind: "target", service, target: `${target.name}, ${fromConnectionFile}` };
  }
  return { kind: "target", service, target: `${target.kind} ${target.name}` };
}

/** Who asked, as the provider attests it: "You", or the agent's name with hidden characters marked. */
export function requesterName(author: MessagingAuthor): string {
  return author.kind === "me" ? "You" : markHiddenName(author.name);
}

/**
 * Reviews an action item the user opened (`action-steppers.review-mode`): checks its request
 * against the installed catalog with `validateStepperRequest`, applies the user's requester policy
 * to the source the provider attests, refuses a Paperclip request on a host the user didn't
 * connect (`action-steppers.paperclip-host`), and builds the screen's view. The stage is `expired` past
 * the request's expiry, `blocked` when the policy doesn't allow its risk from that source, and
 * otherwise `desktop-only`: only the stepper run, in the desktop app, makes a request `ready`.
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
  const host = bindPaperclipHost(definition, action, context.paperclips ?? noConnections);
  if (host.kind === "refused") return { kind: "unreadable", reasons: [host.reason] };
  const expiresAt = new Date(action.expires);
  if (Number.isNaN(expiresAt.getTime())) {
    return { kind: "unreadable", reasons: ["its expiry isn't a date and time"] };
  }
  const { risk, touches } = checked.value;
  const signsIn = definition.steps.some((step) => step.kind === "sign-in");
  let stage: StepperStage = { kind: "desktop-only" };
  if (!policyAllows(item, source, risk, context.policy)) stage = { kind: "blocked" };
  // Expired wins over blocked on purpose: an expired request can't run whatever the policy says,
  // so the screen says it expired and offers no Decline, rather than blaming the user's settings.
  if (expiresAt.getTime() <= context.now.getTime()) stage = { kind: "expired" };
  const view: StepperView = {
    title: definition.title,
    service: definition.service,
    account: null,
    touches: touches.flatMap((touch) => touch.targets).map((target) => touchOf(target, signsIn)),
    risk,
    expiresAt,
    requester: { name: requesterName(item.from), source: source?.label ?? "an unknown source" },
    reason: item.question,
    steps: stepViews(
      definition,
      definition.preview(parsed.value, context.current),
      action.parameters,
      context.catalog,
    ),
    serviceDown: false,
    stage,
  };
  return { kind: "stepper", view };
}
