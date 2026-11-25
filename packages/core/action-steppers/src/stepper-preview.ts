import { parse } from "@halonicjs/schema-kit";
import { type RequestBlock, splitReference } from "./stepper-request.ts";
import type { StepperCatalog, StepperDefinition, StepperTarget } from "./stepper-types.ts";
import type { ValidatedStepperRequest } from "./validate-stepper-request.ts";

/**
 * Text the requester wrote, which Halonic didn't check. Studio shows it apart
 * from Halonic's own lines, under its `heading` (architecture note, 7.1).
 */
export interface RequesterText {
  heading: string;
  lines: readonly string[];
  /** The label of the result the user pastes back, if the block asks for one. */
  resultLabel?: string;
}

/** What one block will do, numbered from 1 as the reasons and touches number it. */
export interface BlockPreview {
  block: number;
  /** Halonic's own lines: a definition's preview, or the full address a `browser` block opens. */
  lines: readonly string[];
  fromRequester?: RequesterText;
}

/** The preview shown before anything runs: one touches sentence, then each block. */
export interface StepperPreview {
  touches: string;
  blocks: readonly BlockPreview[];
}

/** How the preview names the requester and the catalog's services. */
export interface PreviewNames {
  /** Who filed the request, as the attested source names them, such as `acme-bot`. */
  requester: string;
  /** A service's name for people, such as `GitHub` for `github`. */
  service(service: string): string;
}

function joinList(parts: readonly string[]): string {
  if (parts.length <= 2) return parts.join(" and ");
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

function pageHost(page: StepperTarget): string {
  const slash = page.name.indexOf("/");
  return slash === -1 ? page.name : page.name.slice(0, slash);
}

function describePages(pages: readonly StepperTarget[]): string[] {
  const countByHost = new Map<string, number>();
  for (const page of pages) {
    const host = pageHost(page);
    countByHost.set(host, (countByHost.get(host) ?? 0) + 1);
  }
  return [...countByHost].map(
    ([host, count]) => `opens ${count} ${count === 1 ? "page" : "pages"} on \`${host}\``,
  );
}

function describeTouches(targets: readonly StepperTarget[], names: PreviewNames): string {
  const seen = new Set<string>();
  const services: string[] = [];
  for (const target of targets.filter((target) => target.kind !== "page")) {
    const text = `${names.service(target.service)} ${target.kind} \`${target.name}\``;
    if (seen.has(text)) continue;
    seen.add(text);
    services.push(text);
  }
  const pages = describePages(targets.filter((target) => target.kind === "page"));
  return `This stepper touches: ${joinList([...services, ...pages])}.`;
}

function definitionLines(
  definition: StepperDefinition | undefined,
  parameters: unknown,
  reference: string,
): readonly string[] {
  // The request was validated against this catalog, so both lookups succeed; the
  // fallback only shows the reference rather than hiding a block.
  if (definition === undefined) return [`Runs \`${reference}\`.`];
  const parsed = parse(definition.parameters, parameters);
  return parsed.ok ? definition.preview(parsed.value) : [`Runs \`${reference}\`.`];
}

function requesterText(names: PreviewNames, lines: readonly string[]): RequesterText {
  return { heading: `Instructions from ${names.requester}, not checked by Halonic`, lines };
}

function previewBlock(
  block: RequestBlock,
  catalog: StepperCatalog,
  names: PreviewNames,
): Omit<BlockPreview, "block"> {
  switch (block.kind) {
    case "use": {
      const { id, version } = splitReference(block.ref);
      return {
        lines: definitionLines(catalog.definition(id, version), block.parameters, block.ref),
      };
    }
    case "step": {
      const { id, version } = splitReference(block.ref);
      return { lines: definitionLines(catalog.stepType(id, version), block.parameters, block.ref) };
    }
    case "browser": {
      const fromRequester: RequesterText = {
        ...requesterText(names, block.instructions),
        ...(block.result === undefined ? {} : { resultLabel: block.result.label }),
      };
      return { lines: [`Opens ${block.url}`], fromRequester };
    }
    case "server-session":
      // The block is irreversible, so the user reads the requester's steps and
      // "Done when" here, before any confirm screen (Liam's review of #5866).
      return {
        lines: [`Opens Claude Code on your server for ${block.task}.`],
        fromRequester: requesterText(names, [...block.steps, `Done when: ${block.doneWhen}`]),
      };
  }
}

/**
 * Builds the preview the user reads before a stepper runs (architecture note
 * on HAL-17491, 7.3): one sentence listing everything the request touches,
 * then each block's lines. The requester's own words are kept apart, so
 * Studio can label them as unchecked.
 *
 * @param validated - a request `validateStepperRequest` took against the same catalog
 *
 * @example
 * const preview = previewStepperRequest(checked.value, catalog, { requester: "acme-bot", service: serviceName });
 * preview.touches; // "This stepper touches: GitHub repository `acme/app` and opens 1 page on `github.com`."
 */
export function previewStepperRequest(
  validated: ValidatedStepperRequest,
  catalog: StepperCatalog,
  names: PreviewNames,
): StepperPreview {
  const targets = validated.touches.flatMap((touch) => touch.targets);
  return {
    touches: describeTouches(targets, names),
    blocks: validated.request.blocks.map((block, index) => ({
      block: index + 1,
      ...previewBlock(block, catalog, names),
    })),
  };
}
