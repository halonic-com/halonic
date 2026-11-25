import { approvalTypeWords, approvalWords } from "./approval-words.ts";
import { asList, asRecord, field, type JsonRecord, text } from "./json.ts";
import { stepperRequestKey } from "./steppers.ts";

// The question an approval or a confirmation shows, as Markdown (`paperclip-client.approval-fields`).
// Payload shapes are Paperclip's: the approval create route takes any payload, so each type's
// fields are the ones Paperclip's own approval screen reads. Every value is agent-written.

/** `value` on one line, so an agent's newline can't end a list item or start a block. */
export function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** A `- Label: value` line for each field that has a value. */
export function fieldLines(fields: readonly (readonly [string, string | undefined])[]): string[] {
  return fields.flatMap(([label, value]) =>
    value === undefined ? [] : [`- ${label}: ${oneLine(value)}`],
  );
}

/** Whole US cents as dollars, as Paperclip shows costs. */
function dollars(cents: unknown): string | undefined {
  return typeof cents === "number" && Number.isFinite(cents)
    ? `$${(cents / 100).toFixed(2)}`
    : undefined;
}

/** `body` under a bold heading, or nothing without a body. */
export function section(heading: string, body: string | undefined): string[] {
  return body === undefined ? [] : [`**${heading}**\n\n${body}`];
}

/** `content` in a code block whose fence is longer than any run of backticks in it. */
function codeBlock(content: string): string {
  const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}\n${content}\n${fence}`;
}

function hireFields(payload: JsonRecord | undefined): string[] {
  const lines = fieldLines([
    [approvalWords.name, text(payload, "name")],
    [approvalWords.role, text(payload, "role")],
    [approvalWords.adapter, text(payload, "adapterType")],
    [approvalWords.monthlyBudget, dollars(field(payload, "budgetMonthlyCents"))],
  ]);
  return lines.length === 0 ? [] : [lines.join("\n")];
}

function boardFields(payload: JsonRecord | undefined): string[] {
  const risks = asList(field(payload, "risks")).flatMap((risk) =>
    typeof risk === "string" && risk.trim() !== "" ? [`- ${oneLine(risk)}`] : [],
  );
  return [
    ...section(approvalWords.recommendedAction, text(payload, "recommendedAction")),
    ...section(approvalWords.risks, risks.length === 0 ? undefined : risks.join("\n")),
  ];
}

function strategyFields(payload: JsonRecord | undefined): string[] {
  const plan =
    text(payload, "plan") ??
    text(payload, "description") ??
    text(payload, "strategy") ??
    text(payload, "text");
  return section(approvalWords.plan, plan);
}

function budgetFields(payload: JsonRecord | undefined): string[] {
  const lines = fieldLines([
    [approvalWords.budgetFor, text(payload, "scopeName") ?? text(payload, "scopeType")],
    [approvalWords.limit, dollars(field(payload, "budgetAmount"))],
    [approvalWords.spent, dollars(field(payload, "observedAmount"))],
  ]);
  return [...(lines.length === 0 ? [] : [lines.join("\n")]), approvalWords.budgetApproving];
}

const typeFields: ReadonlyMap<string, (payload: JsonRecord | undefined) => string[]> = new Map([
  ["hire_agent", hireFields],
  ["approve_ceo_strategy", strategyFields],
  ["budget_override_required", budgetFields],
  ["request_board_approval", boardFields],
]);

/**
 * An approval's question: its type in words first, as the title, so the agent's own title
 * never stands in for what approving does; then the agent's title and summary, then the
 * type's fields.
 */
export function approvalQuestion(
  type: string | undefined,
  payload: JsonRecord | undefined,
): string {
  const known = type === undefined ? undefined : approvalTypeWords.get(type);
  const title = known ?? approvalWords.unknownType(type ?? "request");
  const fields = type === undefined ? [] : (typeFields.get(type)?.(payload) ?? []);
  const parts = [title, text(payload, "title"), text(payload, "summary"), ...fields];
  return parts.filter((part) => part !== undefined).join("\n\n");
}

/** The document a confirmation is bound to, such as a plan at one revision; nothing without one. */
function targetLine(payload: JsonRecord | undefined): string[] {
  const target = asRecord(field(payload, "target"));
  const name = text(target, "label") ?? text(target, "key");
  // A stepper request is the card itself, shown as an action item, not a document to read.
  if (name === undefined || text(target, "key") === stepperRequestKey) {
    return [];
  }
  const revision = field(target, "revisionNumber");
  const named =
    typeof revision === "number" ? `${name}, ${approvalWords.revision(revision)}` : name;
  const href = text(target, "href");
  // A Paperclip-relative link leads nowhere in Halonic, so only a full web address is linked.
  const linked = href !== undefined && /^https?:\/\//.test(href) ? `[${named}](${href})` : named;
  return [`${approvalWords.document}: ${linked}`];
}

/** The tool an "ask first" confirmation would run, and its arguments; nothing for other confirmations. */
function toolLines(payload: JsonRecord | undefined): string[] {
  const action = asRecord(field(payload, "toolAction"));
  const tool = text(action, "toolDisplayName") ?? text(action, "toolName");
  if (tool === undefined) {
    return [];
  }
  const app = text(action, "appDisplayName");
  const argumentsJson = text(action, "argumentsSummaryJson");
  return [
    `${approvalWords.tool}: ${oneLine(app === undefined ? tool : `${tool} (${app})`)}`,
    ...(argumentsJson === undefined
      ? []
      : [`**${approvalWords.arguments}**\n\n${codeBlock(argumentsJson)}`]),
  ];
}

/** A confirmation's question: its prompt and details, the document it is bound to, and the tool it would run. */
export function confirmationQuestion(payload: JsonRecord | undefined): string {
  const parts = [
    text(payload, "prompt") ?? "",
    text(payload, "detailsMarkdown"),
    ...targetLine(payload),
    ...toolLines(payload),
  ];
  return parts.filter((part) => part !== undefined).join("\n\n");
}

/** Whether a confirmation asks to run a tool, which makes it as risky as an approval that changes rights. */
export function asksToRunTool(payload: JsonRecord | undefined): boolean {
  return asRecord(field(payload, "toolAction")) !== undefined;
}
