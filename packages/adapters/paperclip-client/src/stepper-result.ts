import {
  type RequestBlock,
  type StepperCatalog,
  type StepperRequest,
  splitReference,
} from "@halonicjs/action-steppers";
import type { ActionResultAnswer, ActionResultStep } from "@halonicjs/ports";

/** What the result of one stepper request is written from. */
export interface StepperResultInput {
  request: StepperRequest;
  /** The `stepper-request` revision that ran. */
  revision: string;
  answer: ActionResultAnswer;
  catalog: StepperCatalog;
  /** When Studio answered; every block is stamped with it, since the answer holds no time per step. */
  at: Date;
}

/** The `stepper-result` document and the one comment that points at it. */
export interface StepperResult {
  document: string;
  summary: string;
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `25 Nov 2026`, in UTC. */
function dayOf(at: Date): string {
  return `${at.getUTCDate()} ${months[at.getUTCMonth()]} ${at.getUTCFullYear()}`;
}

/** `2026-11-25 01:40 UTC`. */
function timeOf(at: Date): string {
  return `${at.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Text that stays in one table cell: no line break, pipe or backtick can end it early. */
function cell(value: string): string {
  return value.replace(/[\r\n|`]+/g, " ").trim();
}

/**
 * Whether a block takes a secret: it uses a reviewed definition or step type
 * with a secret `input` step. Its result then says only when it was set.
 */
function takesSecret(block: RequestBlock, catalog: StepperCatalog): boolean {
  if (block.kind !== "use" && block.kind !== "step") return false;
  const { id, version } = splitReference(block.ref);
  const found =
    block.kind === "use" ? catalog.definition(id, version) : catalog.stepType(id, version);
  return found?.steps.some((step) => step.kind === "input" && step.secret) ?? false;
}

function whatOf(block: RequestBlock): string {
  switch (block.kind) {
    case "use":
    case "step":
      return `\`${cell(block.ref)}\``;
    case "browser":
      return `page \`${cell(block.url)}\``;
    case "server-session":
      return `server session \`${cell(block.task)}\``;
  }
}

/** The kept fields as `name: value`, a web address as a link: what the step made or changed. */
function keptOf(step: ActionResultStep): string {
  return Object.entries(step.kept ?? {})
    .map(([name, value]) => {
      const shown = cell(String(value));
      return /^https:\/\/[^\s()<>]+$/.test(shown)
        ? `${cell(name)}: [${shown}](${shown})`
        : `${cell(name)}: \`${shown}\``;
    })
    .join(", ");
}

function succeededOf(step: ActionResultStep, secret: boolean, at: Date): string {
  const byHand = step.byHand === true ? ", done by hand" : "";
  // A secret step says only when it was set: never a kept field, whatever the answer holds.
  if (secret) return `set on ${dayOf(at)}${byHand}`;
  const kept = keptOf(step);
  const done = step.byHand === true ? "done by hand" : "done";
  return kept === "" ? done : `${done}: ${kept}`;
}

/** `Started a server session on 25 Nov 2026 for HAL-1234`: the session runs on, so "done" would mislead. */
function sessionStartedOf(task: string, at: Date): string {
  return `Started a server session on ${dayOf(at)} for ${cell(task)}`;
}

function resultOf(
  block: RequestBlock,
  step: ActionResultStep | undefined,
  notRun: string,
  catalog: StepperCatalog,
  at: Date,
) {
  if (step === undefined) return notRun;
  if (step.outcome === "skipped") return "skipped";
  if (step.outcome === "succeeded" && block.kind === "server-session")
    return sessionStartedOf(block.task, at);
  if (step.outcome === "succeeded") return succeededOf(step, takesSecret(block, catalog), at);
  const said = step.error === undefined ? "" : `, the service said: "${cell(step.error.text)}"`;
  return `failed (${step.failure ?? "unknown"})${said}`;
}

/**
 * The `stepper-result` document for one run and its summary comment
 * (architecture note on HAL-17491, 7.4): per block its status, time and
 * short result, links to what changed, "set on <date>" for a secret and
 * "done by hand" for a step the user did by hand, and the request revision
 * that ran. It holds no secret value, token or whole answer body, because
 * the answer it is written from holds none (`ports.agent-messaging-actions`).
 */
export function renderStepperResult(input: StepperResultInput): StepperResult {
  const { request, revision, answer, catalog, at } = input;
  const ran = answer.outcome !== "declined" && answer.outcome !== "expired";
  const notRun = ran ? "not reached" : "not run";
  const rows = request.blocks.map((block, index) => {
    const step = answer.steps.find((candidate) => candidate.step === index + 1);
    const result = resultOf(block, step, notRun, catalog, at);
    return `| ${index + 1} | ${whatOf(block)} | ${result} | ${step === undefined ? "" : timeOf(at)} |`;
  });
  const document = [
    "# Stepper result",
    "",
    `- Request: \`stepper-request\` revision \`${revision}\`, "${cell(request.title)}"`,
    `- Outcome: **${answer.outcome}**`,
    `- Answered in Halonic: ${timeOf(at)}`,
    "",
    "| Block | What | Result | Time |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
  return { document, summary: summaryOf(answer, request.blocks, at) };
}

function summaryOf(answer: ActionResultAnswer, blocks: readonly RequestBlock[], at: Date): string {
  const see = "The document `stepper-result` on this task has each block's result.";
  if (answer.outcome === "declined") return `Declined in Halonic: nothing ran. ${see}`;
  if (answer.outcome === "expired")
    return `The stepper request expired in Halonic: nothing ran. ${see}`;
  const done = answer.steps.filter((step) => step.outcome === "succeeded");
  // A `server-session` block is always the request's only block (validateStepperRequest).
  const [first] = blocks;
  if (first?.kind === "server-session" && done.some((step) => step.step === 1))
    return `${sessionStartedOf(first.task, at)}. ${see}`;
  const byHand = done.filter((step) => step.byHand === true).length;
  const handPart = byHand === 0 ? "" : `, ${byHand} by hand`;
  return `The stepper ${answer.outcome} in Halonic: ${done.length} of ${blocks.length} blocks done${handPart}. ${see}`;
}
