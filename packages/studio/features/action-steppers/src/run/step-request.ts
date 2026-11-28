/**
 * Builds what the stepper sends for one step: the step's reference and its values, sorted into
 * the route's placeholders and body (plan on HAL-17535, question 1). The route only sorts: the
 * shell checks every value again against its own compiled list, so a wrong route here can only
 * get a step refused, never send something else (HAL-17491 2.4). The one exception is a list
 * field: the shell only knows it holds integers, so which parameter fills it comes from the
 * definition's step here, and the gate (`check-gate.ts`) compares that same parameter with what
 * the check kept before the step is sent.
 */
import type { Step } from "@halonicjs/action-steppers";
import type {
  ActionBodyField,
  ActionCallRoute,
  ActionOperationRoute,
  ActionRoute,
  ActionSendRequest,
  ActionStepRef,
  InboxActionRequest,
} from "@halonicjs/ports";

type Parameters = InboxActionRequest["parameters"];

/** One value of the body the page sends, as the port takes it. */
type PageValue = NonNullable<ActionSendRequest["body"]>[string];

/** The body the page sends for a call step. */
export type PageBody = Record<string, PageValue>;

/** The fields the page sends; the sender adds `constant` and `secret-input` fields itself. */
function filledByPage(field: ActionBodyField): boolean {
  return field.kind !== "constant" && field.kind !== "secret-input";
}

/** Each of the route's placeholders, as text, from the request's checked parameters. */
function placeholdersOf(route: ActionRoute, parameters: Parameters): Record<string, string> {
  const placeholders: Record<string, string> = {};
  for (const name of Object.keys(route.placeholders)) {
    const value = parameters[name];
    // A missing value stays missing, so the sender refuses the step with `bad-value`.
    if (value !== undefined) placeholders[name] = String(value);
  }
  return placeholders;
}

/**
 * The value the page sends for one body field: the parameter of the same name, or for an
 * `integer-list` field its definition's `parameter` as a one-item list, such as
 * `environment_ids: [161]`. The route can't name that parameter, since the shell's route file
 * allows no other fields, so it comes from the definition's step.
 */
function pageValue(
  field: ActionBodyField,
  parameters: Parameters,
  step: Step | undefined,
): PageValue | undefined {
  if (field.kind !== "integer-list") return parameters[field.name];
  const source =
    step?.kind === "call" ? step.body.find((each) => each.name === field.name) : undefined;
  if (source?.kind !== "parameter-list") return undefined;
  const value = parameters[source.parameter];
  // A missing value stays missing, so the sender refuses the step with `bad-value`.
  return typeof value === "number" ? [value] : undefined;
}

/**
 * The body fields the page sends for a call or operation step, from the request's checked parameters; the
 * sender adds `constant` and `secret-input` fields itself. Both the send and "Show the request"
 * build it here, so the screen shows what goes out.
 *
 * @param step - the definition's step the route belongs to, which names each list field's parameter
 */
export function pageBody(
  route: ActionCallRoute | ActionOperationRoute,
  parameters: Parameters,
  step: Step | undefined,
): PageBody {
  const body: PageBody = {};
  for (const field of route.body.filter(filledByPage)) {
    const value = pageValue(field, parameters, step);
    if (value !== undefined) body[field.name] = value;
  }
  return body;
}

/**
 * The reference of a guided step, or the whole request of a call step, for `request`'s step.
 *
 * @param step - the definition's step the route belongs to
 * @example
 * stepRequest(request, route, definition.steps[1]); // { definition: "acme.set-variable", version: 1, step: 2, placeholders: { owner: "acme", repo: "app", name: "ACME_MODE" }, body: { value: "on" } }
 */
export function stepRequest(
  request: InboxActionRequest,
  route: ActionRoute,
  step: Step | undefined,
): ActionStepRef | ActionSendRequest {
  const reference: ActionStepRef = {
    definition: request.definition,
    version: request.version,
    step: route.step,
    placeholders: placeholdersOf(route, request.parameters),
  };
  if (route.kind === "guided" || !route.body.some(filledByPage)) return reference;
  return { ...reference, body: pageBody(route, request.parameters, step) };
}

/** Whether a step's value is one the user types in the shell's dialog, so the answer may only say when. */
export function setsSecret(route: ActionRoute | undefined): boolean {
  if (route === undefined || route.kind === "guided") return false;
  return route.body.some((field) => field.kind === "secret-input");
}
