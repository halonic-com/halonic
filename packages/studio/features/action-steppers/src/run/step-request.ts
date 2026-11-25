/**
 * Builds what the stepper sends for one step: the step's reference and its values, sorted into
 * the route's placeholders and body (plan on HAL-17535, question 1). The route only sorts: the
 * shell checks every value again against its own compiled list, so a wrong route here can only
 * get a step refused, never send something else (HAL-17491 2.4).
 */
import type {
  ActionBodyField,
  ActionCallRoute,
  ActionRoute,
  ActionSendRequest,
  ActionStepRef,
  ActionValue,
  InboxActionRequest,
} from "@halonicjs/ports";

type Parameters = InboxActionRequest["parameters"];

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

function bodyOf(route: ActionCallRoute, parameters: Parameters): Record<string, ActionValue> {
  const body: Record<string, ActionValue> = {};
  for (const field of route.body.filter(filledByPage)) {
    const value = parameters[field.name];
    if (value !== undefined) body[field.name] = value;
  }
  return body;
}

/**
 * The reference of a guided step, or the whole request of a call step, for `request`'s step.
 *
 * @example
 * stepRequest(request, route); // { definition: "acme.set-variable", version: 1, step: 2, placeholders: { owner: "acme", repo: "app", name: "ACME_MODE" }, body: { value: "on" } }
 */
export function stepRequest(
  request: InboxActionRequest,
  route: ActionRoute,
): ActionStepRef | ActionSendRequest {
  const reference: ActionStepRef = {
    definition: request.definition,
    version: request.version,
    step: route.step,
    placeholders: placeholdersOf(route, request.parameters),
  };
  if (route.kind === "guided" || !route.body.some(filledByPage)) return reference;
  return { ...reference, body: bodyOf(route, request.parameters) };
}

/** Whether a step's value is one the user types in the shell's dialog, so the answer may only say when. */
export function setsSecret(route: ActionRoute | undefined): boolean {
  return route?.kind === "call" && route.body.some((field) => field.kind === "secret-input");
}
