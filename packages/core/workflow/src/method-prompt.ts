import type { AgentMethod, MethodField } from "@halonicjs/format";
import { render, renderText } from "./template.ts";

/**
 * The prompt a step that calls one of its agent's methods sends, in the old
 * runner's words: the method's name and description, its instructions with
 * the step's `with` values filled in, and, when the method answers with
 * fields, a line that names them. Each `with` value is rendered against the
 * run's scope first, so a value that is one placeholder keeps its type; the
 * instructions then see only those values, by name, as the method's `input`
 * lists them.
 *
 * @example
 * methodPrompt("extract", extract, { invoice: "{{input.invoice}}" }, scope);
 * // 'Method "extract": Pull the vendor out.\n\nExtract the vendor from: Acme Paper, 120 EUR'
 */
export function methodPrompt(
  name: string,
  method: AgentMethod,
  withValues: Record<string, unknown> | undefined,
  scope: unknown,
): string {
  const values = renderValues(withValues ?? {}, scope);
  const parts = [methodHeading(name, method), renderText(method.instructions, values)];
  if (method.output !== "text") {
    parts.push(fieldsLine(method.output));
  }
  return parts.join("\n\n");
}

function renderValues(values: Record<string, unknown>, scope: unknown): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, render(value, scope)]),
  );
}

function methodHeading(name: string, method: AgentMethod): string {
  const heading = `Method ${JSON.stringify(name)}`;
  return method.description === undefined ? `${heading}.` : `${heading}: ${method.description}`;
}

/** `Answer with JSON with these fields: vendor (string), note (string, may be left out).` */
function fieldsLine(fields: Record<string, MethodField>): string {
  const described = Object.entries(fields).map(([field, type]) => `${field} (${fieldType(type)})`);
  return `Answer with JSON with these fields: ${described.join(", ")}.`;
}

/** A trailing "?" makes a field optional. */
function fieldType(type: MethodField): string {
  return type.endsWith("?") ? `${type.slice(0, -1)}, may be left out` : type;
}
