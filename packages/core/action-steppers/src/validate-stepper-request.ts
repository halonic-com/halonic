import { formatPath, type Issue, parse } from "@halonicjs/schema-kit";
import { encodeUtf8, err, ok, type Result } from "@halonicjs/std";
import { checkBrowserAddress } from "./browser-address.ts";
import { compileResultPattern } from "./result-pattern.ts";
import {
  maxStepperRequestBytes,
  type StepperBlock,
  type StepperRequest,
  splitReference,
  stepperRequestSchema,
} from "./stepper-request.ts";
import { type StepperRisk, stepperRisks } from "./stepper-risk.ts";
import type { StepperCatalog, StepperDefinition, StepperTarget } from "./stepper-types.ts";

/** What one block touches, numbered from 1 as the preview and the reasons show it. */
export interface BlockTouches {
  block: number;
  risk: StepperRisk;
  targets: readonly StepperTarget[];
}

/** A request that passed every check, with what it touches and its risk: the highest of its blocks. */
export interface ValidatedStepperRequest {
  request: StepperRequest;
  risk: StepperRisk;
  touches: readonly BlockTouches[];
}

type BlockCheck = Result<Omit<BlockTouches, "block">, string>;

function highestRisk(risks: readonly StepperRisk[]): StepperRisk {
  return risks.reduce<StepperRisk>(
    (highest, risk) =>
      stepperRisks.indexOf(risk) > stepperRisks.indexOf(highest) ? risk : highest,
    "routine",
  );
}

function issueReason(issue: Issue): string {
  const [first, index, ...rest] = issue.path;
  if (first === "blocks" && typeof index === "number") {
    const where = rest.length > 0 ? `${formatPath(rest)}: ` : "";
    return `block ${index + 1}: ${where}${issue.message}`;
  }
  const where = issue.path.length > 0 ? `${formatPath(issue.path)}: ` : "";
  return `${where}${issue.message}`;
}

function checkReferenced(
  reference: string,
  parameters: unknown,
  found: StepperDefinition | undefined,
  missing: string,
): BlockCheck {
  if (found === undefined) return err(`\`${reference}\` ${missing}`);
  const parsed = parse(found.parameters, parameters);
  if (!parsed.ok) return err(`\`${reference}\`: ${parsed.error.map(issueReason).join("; ")}`);
  return ok({ risk: found.risk, targets: found.targets(parsed.value) });
}

function checkUse(
  block: { ref: string; parameters: unknown },
  catalog: StepperCatalog,
): BlockCheck {
  const { id, version } = splitReference(block.ref);
  return checkReferenced(
    block.ref,
    block.parameters,
    catalog.definition(id, version),
    "isn't in this Halonic's catalog",
  );
}

function checkStep(
  block: { ref: string; parameters: unknown },
  catalog: StepperCatalog,
): BlockCheck {
  const { id, version } = splitReference(block.ref);
  return checkReferenced(
    block.ref,
    block.parameters,
    catalog.stepType(id, version),
    "isn't a reviewed step type",
  );
}

function checkBrowser(
  block: Extract<StepperBlock, { kind: "browser" }>,
  catalog: StepperCatalog,
): BlockCheck {
  const page = checkBrowserAddress(block.url, catalog.browserOrigins);
  if (!page.ok) return page;
  const result =
    block.result === undefined ? ok(undefined) : compileResultPattern(block.result.pattern);
  if (!result.ok) return err(`the result pattern isn't allowed: ${result.error}`);
  // A browser block counts as admin: the user follows the requester's own words on a page where they have full rights.
  if (block.check === undefined) return ok({ risk: "admin", targets: [page.value] });
  const check = checkStep(block.check, catalog);
  if (!check.ok) return err(`check: ${check.error}`);
  return ok({
    risk: highestRisk(["admin", check.value.risk]),
    targets: [page.value, ...check.value.targets],
  });
}

function checkBlock(block: StepperBlock, catalog: StepperCatalog): BlockCheck {
  switch (block.kind) {
    case "use":
      return checkUse(block, catalog);
    case "step":
      return checkStep(block, catalog);
    case "browser":
      return checkBrowser(block, catalog);
  }
}

function readJson(json: string): Result<unknown, string> {
  if (encodeUtf8(json).length > maxStepperRequestBytes) return err("the request is over 16 KB");
  try {
    return ok(JSON.parse(json));
  } catch {
    // Untrusted text: the reason says what's wrong without echoing it.
    return err("the request isn't valid JSON");
  }
}

/**
 * Checks a `halonic.stepper-request/1` document against the installed
 * catalog (architecture note on HAL-17491, 7.3). The engine runs it when an
 * agent files, the Paperclip provider when it reads a card, and Studio when
 * the user opens the item and before each step.
 *
 * @param json - the document's text, at most 16 KB
 * @returns the parsed request with its touches and risk, or every reason, each naming its block
 *
 * @example
 * const checked = validateStepperRequest(documentBody, catalog);
 * if (!checked.ok) return showReasons(checked.error); // ["block 2: `github.delete-repo@1` isn't a reviewed step type"]
 */
export function validateStepperRequest(
  json: string,
  catalog: StepperCatalog,
): Result<ValidatedStepperRequest, string[]> {
  const read = readJson(json);
  if (!read.ok) return err([read.error]);
  const parsed = parse(stepperRequestSchema, read.value);
  if (!parsed.ok) return err(parsed.error.map(issueReason));
  const reasons: string[] = [];
  const touches: BlockTouches[] = [];
  parsed.value.blocks.forEach((block, index) => {
    const checked = checkBlock(block, catalog);
    if (checked.ok) touches.push({ block: index + 1, ...checked.value });
    else reasons.push(`block ${index + 1}: ${checked.error}`);
  });
  if (reasons.length > 0) return err(reasons);
  return ok({
    request: parsed.value,
    risk: highestRisk(touches.map((touch) => touch.risk)),
    touches,
  });
}
