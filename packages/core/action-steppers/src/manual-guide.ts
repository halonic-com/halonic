import { parse } from "@halonicjs/schema-kit";
import type { ServerSessionBlock } from "./server-session-block.ts";
import { type RequestBlock, type StepperBlock, splitReference } from "./stepper-request.ts";
import type { InputStep, Step, StepperCatalog, StepperDefinition } from "./stepper-types.ts";
import type { ValidatedStepperRequest } from "./validate-stepper-request.ts";

type Values = Readonly<Record<string, unknown>>;
type Reference = { ref: string; parameters: unknown };

/** Marks a line the requester wrote, which Halonic didn't check. */
const fromRequester = (line: string) => `(from the requester, not checked by Halonic) ${line}`;

const placeholder = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

/**
 * Fills `{name}` placeholders with checked parameter values. In an address
 * each value is percent-encoded, as the shell builds it. A placeholder with
 * no value stays as written, so the guide never hides a gap in a definition.
 */
function fill(template: string, values: Values, encode: (value: string) => string): string {
  return template.replace(placeholder, (whole, name: string) => {
    const value = values[name];
    return value === undefined ? whole : encode(String(value));
  });
}

const fillText = (template: string, values: Values) => fill(template, values, (value) => value);
const fillAddress = (template: string, values: Values) =>
  fill(template, values, encodeURIComponent);

function inputLines(step: InputStep, values: Values): string[] {
  const label = fillText(step.label, values);
  // A secret is named, never given a field: the user types it straight into the service's page.
  if (step.secret) {
    return [
      `Have ${label} ready. Type it only into the service's page in the next step, never into this card, a chat or a file.`,
    ];
  }
  return [`Decide on ${label}; you type it on the service's page in the next step.`];
}

function stepLines(step: Step, values: Values): string[] {
  switch (step.kind) {
    case "guided": {
      const result =
        step.result === undefined
          ? []
          : [`Copy ${step.result.label} from the page and paste it back on the card.`];
      return [
        `Open ${fillAddress(step.address, values)}`,
        ...step.instructions.map((line) => fillText(line, values)),
        ...result,
      ];
    }
    case "input":
      return inputLines(step, values);
    case "script":
      return [
        `Open ${fillAddress(step.manual.url, values)}`,
        ...step.manual.instructions.map((line) => fillText(line, values)),
      ];
  }
}

function referencedLines(
  block: Reference,
  lookUp: (id: string, version: number) => StepperDefinition | undefined,
): string[] {
  const { id, version } = splitReference(block.ref);
  const definition = lookUp(id, version);
  const parsed =
    definition === undefined ? undefined : parse(definition.parameters, block.parameters);
  // The request was validated against this catalog, so neither can fail; if it does, the caller passed another catalog.
  if (definition === undefined || parsed === undefined || !parsed.ok) {
    throw new Error(`\`${block.ref}\` doesn't match the catalog the request was validated against`);
  }
  const values = parsed.value as Values;
  return definition.steps.flatMap((step) => stepLines(step, values));
}

function browserLines(
  block: Extract<StepperBlock, { kind: "browser" }>,
  catalog: StepperCatalog,
): string[] {
  const result =
    block.result === undefined
      ? []
      : [`Copy ${block.result.label} from the page and paste it back on the card.`];
  const check =
    block.check === undefined
      ? []
      : [
          "Check that it worked:",
          ...referencedLines(block.check, (id, version) => catalog.stepType(id, version)),
        ];
  return [`Open ${block.url}`, ...block.instructions.map(fromRequester), ...result, ...check];
}

function serverSessionLines(block: ServerSessionBlock): string[] {
  return [
    "Open a terminal and sign in to your server with ssh.",
    ...block.steps.map(fromRequester),
    fromRequester(`Check that it's done: ${block.doneWhen}`),
    `Report back on ${block.task}. Never paste a key, token or password into the task.`,
  ];
}

function blockLines(block: RequestBlock, catalog: StepperCatalog): string[] {
  switch (block.kind) {
    case "use":
      return referencedLines(block, (id, version) => catalog.definition(id, version));
    case "step":
      return referencedLines(block, (id, version) => catalog.stepType(id, version));
    case "browser":
      return browserLines(block, catalog);
    case "server-session":
      return serverSessionLines(block);
  }
}

/**
 * Renders the manual guide of a request (architecture note on HAL-17491,
 * 7.8): plain numbered instructions with the exact page addresses, what to
 * click, what to paste back and how to check it worked, built from the same
 * definitions and checked parameters the stepper runs, so the two can't
 * drift. A secret is named, never given a value. It's plain text, for a
 * Paperclip card's body or Studio's "Do it by hand".
 *
 * @param validated - a request `validateStepperRequest` took against the same catalog
 * @throws Error when a block's definition isn't in `catalog`: a different catalog was passed
 *
 * @example
 * const checked = validateStepperRequest(documentBody, catalog);
 * if (checked.ok) cardBody = renderManualGuide(checked.value, catalog);
 * // "Set up acme/app\n\nDo these steps in order, signed in with your own account:\n1. Open https://github.com/…"
 */
export function renderManualGuide(
  validated: ValidatedStepperRequest,
  catalog: StepperCatalog,
): string {
  const steps = validated.request.blocks.flatMap((block) => blockLines(block, catalog));
  return [
    validated.request.title,
    "",
    "Do these steps in order, signed in with your own account:",
    ...steps.map((line, index) => `${index + 1}. ${line}`),
    "",
  ].join("\n");
}

/**
 * Why a definition can't be done by hand: every `script` step needs a manual
 * form with an `https` page and at least one instruction, and every `guided`
 * step at least one instruction. The catalog's tests call it for each
 * definition, so one without a manual form fails before it ships.
 *
 * @returns every problem, each naming its step from 1; empty when there is none
 */
export function manualFormProblems(definition: StepperDefinition): string[] {
  return definition.steps.flatMap((step, index) => {
    const where = `${definition.id}@${definition.version} step ${index + 1}`;
    if (step.kind === "guided" && step.instructions.length === 0) {
      return [`${where}: a guided step needs at least one instruction`];
    }
    if (step.kind !== "script") return [];
    // The type requires `manual`, but a definition built from JSON or with a cast can still lack it.
    const manual: unknown = step.manual;
    if (manual === undefined || manual === null)
      return [`${where}: an API step needs a manual form`];
    if (!step.manual.url.startsWith("https://")) {
      return [`${where}: the manual form's page must be an https address`];
    }
    if (step.manual.instructions.length === 0) {
      return [`${where}: the manual form needs at least one instruction`];
    }
    return [];
  });
}
