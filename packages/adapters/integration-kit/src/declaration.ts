import type { IntegrationSheet, IntegrationTool as SheetTool } from "@halonicjs/format/integration";
import { type Integration, type IntegrationTool, integrationVersion } from "@halonicjs/ports";
import type { LoadProblem } from "./load-problem.ts";

/**
 * Where the integration's code differs from its permission sheet: the kit
 * version, the name, the version, and each tool's text, `risk` and
 * `untrusted`. The user approves the sheet, so the code must be exactly what
 * it says. Empty when they match.
 *
 * @example
 * declarationProblems(sheet, weather); // [] when code and sheet agree
 */
export function declarationProblems(
  sheet: IntegrationSheet,
  integration: Integration,
): LoadProblem[] {
  const problems: LoadProblem[] = [];
  const add = (code: string, path: LoadProblem["path"], message: string) =>
    problems.push({ code, path, message: `${sheet.id}: ${message}` });

  if (sheet.kit !== integrationVersion) {
    add(
      "kit-version",
      ["kit"],
      `built against kit ${sheet.kit}, but this Halonic offers kit ${integrationVersion}`,
    );
  }
  if (integration.name !== sheet.id) {
    add("name-differs", ["id"], `the code is named "${integration.name}"`);
  }
  if (integration.version !== sheet.version) {
    add("version-differs", ["version"], `the code is version ${integration.version}`);
  }

  const offered = new Map<string, IntegrationTool>();
  for (const tool of integration.tools) {
    if (offered.has(tool.name)) {
      add("tool-twice", ["tools"], `the code offers the tool "${tool.name}" twice`);
    }
    offered.set(tool.name, tool);
  }
  sheet.tools.forEach((declared, index) => {
    const tool = offered.get(declared.name);
    if (tool === undefined) {
      add("tool-not-offered", ["tools", index], `the code doesn't offer "${declared.name}"`);
      return;
    }
    offered.delete(declared.name);
    for (const field of toolDifferences(declared, tool)) {
      add(
        "tool-differs",
        ["tools", index, field],
        `"${declared.name}" differs in ${field} between code and sheet`,
      );
    }
  });
  for (const name of offered.keys()) {
    add("tool-not-declared", ["tools"], `the code offers "${name}", which the sheet doesn't list`);
  }
  return problems;
}

/** The fields in which a tool's code and its sheet entry differ. */
function toolDifferences(declared: SheetTool, tool: IntegrationTool): string[] {
  const differences: string[] = [];
  if (tool.description !== declared.description) differences.push("description");
  if (tool.risk !== declared.risk) differences.push("risk");
  if ((tool.untrusted ?? false) !== declared.untrusted) differences.push("untrusted");
  const texts = argumentTexts(tool.parameters);
  const listed = declared.arguments ?? {};
  const names = new Set([...Object.keys(texts), ...Object.keys(listed)]);
  if ([...names].some((name) => texts[name] !== listed[name])) differences.push("arguments");
  return differences;
}

/** Each argument's description in the tool's JSON Schema, by name. */
function argumentTexts(parameters: Record<string, unknown>): Record<string, string> {
  const properties = parameters["properties"];
  if (typeof properties !== "object" || properties === null) {
    return {};
  }
  const texts: Record<string, string> = {};
  for (const [name, schema] of Object.entries(properties)) {
    const description = (schema as { description?: unknown } | null)?.description;
    if (typeof description === "string") {
      texts[name] = description;
    }
  }
  return texts;
}
