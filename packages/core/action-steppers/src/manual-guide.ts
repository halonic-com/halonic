import { parse } from "@halonicjs/schema-kit";
import type { ServerSessionBlock } from "./server-session-block.ts";
import { type RequestBlock, type StepperBlock, splitReference } from "./stepper-request.ts";
import type { InputStep, Step, StepperCatalog, StepperDefinition } from "./stepper-types.ts";
import type { ValidatedStepperRequest } from "./validate-stepper-request.ts";

type Values = Readonly<Record<string, unknown>>;
type Reference = { ref: string; parameters: unknown };

/**
 * Whether a character could make text look like a line of its own or
 * reorder what's shown: a control character (line breaks and the terminal's
 * escape included), a Unicode line or paragraph separator, or a bidirectional
 * override.
 */
function isUnsafe(code: number): boolean {
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    code === 0x2028 ||
    code === 0x2029 ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

const oneLine = (text: string) =>
  Array.from(text, (character) => (isUnsafe(character.codePointAt(0) ?? 0) ? " " : character)).join(
    "",
  );

const backtickRun = /`+/g;

/**
 * Quotes text the requester chose as one Markdown code span. The guide is
 * pasted into a Markdown card, so unquoted text could start a numbered line
 * of its own, hide a link's target or load an image. The fence is longer
 * than any backtick run inside, so the text can't close it.
 */
function quoted(text: string): string {
  const line = oneLine(text);
  const longestRun = Math.max(0, ...(line.match(backtickRun) ?? []).map((run) => run.length));
  const fence = "`".repeat(longestRun + 1);
  // A span may not start or end with a backtick; Markdown strips one padding space on each side.
  const padding = line.startsWith("`") || line.endsWith("`") ? " " : "";
  return `${fence}${padding}${line}${padding}${fence}`;
}

const requesterLabel = "(from the requester, not checked by Halonic)";

/** Marks a line the requester wrote, which Halonic didn't check. */
const fromRequester = (line: string) => `${requesterLabel} ${quoted(line)}`;

const placeholder = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

/**
 * Fills `{name}` placeholders with checked parameter values. In an address
 * each value is percent-encoded, as the shell builds it; in text it's quoted,
 * because the requester chose it. A placeholder with no value stays as
 * written, so the guide never hides a gap in a definition.
 */
function fill(template: string, values: Values, encode: (value: string) => string): string {
  return template.replace(placeholder, (whole, name: string) => {
    const value = values[name];
    return value === undefined ? whole : encode(String(value));
  });
}

/**
 * `encodeURIComponent`, plus the `! ' ( ) *` it leaves as they are: a `)` or
 * `!` in a value could otherwise close or start a link or image in the card.
 * A server reads `%28` in a path as `(`, so the page is the same.
 */
const encodeForGuide = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

const fillText = (template: string, values: Values) => fill(template, values, quoted);
const fillAddress = (template: string, values: Values) => fill(template, values, encodeForGuide);

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
    case "call":
    case "check":
    case "script":
    case "sign-in":
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
  return definition.steps.flatMap((step, index) => {
    const lines = stepLines(step, values);
    return isSameSignInPage(step, definition.steps[index - 1]) ? lines.slice(1) : lines;
  });
}

/** Whether a sign-in part is on the page its previous part already opened: the guide says "Open" once. */
function isSameSignInPage(step: Step, previous: Step | undefined): boolean {
  return (
    step.kind === "sign-in" &&
    previous?.kind === "sign-in" &&
    step.manual.url === previous.manual.url
  );
}

function browserLines(
  block: Extract<StepperBlock, { kind: "browser" }>,
  catalog: StepperCatalog,
): string[] {
  const result =
    block.result === undefined
      ? []
      : [`Copy ${quoted(block.result.label)} from the page and paste it back on the card.`];
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
    `${requesterLabel} Check that it's done: ${quoted(block.doneWhen)}`,
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
    quoted(validated.request.title),
    "",
    "Do these steps in order, signed in with your own account:",
    ...steps.map((line, index) => `${index + 1}. ${line}`),
    "",
  ].join("\n");
}

/**
 * Why a definition can't be done by hand: every API step (`call`, `check` or
 * `script`) and every `sign-in` step needs a manual form with an `https` page
 * and at least one instruction, and every `guided`
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
    if (step.kind === "guided" || step.kind === "input") return [];
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
