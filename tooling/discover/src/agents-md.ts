import { readFileSync } from "node:fs";
import { purposePlaceholder } from "@halonicjs/tooling-check";

const templateUrl = new URL("../templates/package-AGENTS.md", import.meta.url);
const featureApiNote = ", plus `src/api.ts` for other features";

/** What the `AGENTS.md` template needs to know about a package. */
export interface AgentsMdInput {
  readonly name: string;
  readonly owner: string;
  readonly layer: string;
  readonly isFeature: boolean;
  readonly purpose?: string;
}

/**
 * Fills in the `AGENTS.md` template.
 *
 * @throws when the template uses a placeholder this doesn't know, so a typo
 *   never ends up as `{{text}}` in a package
 */
export function renderAgentsMd(
  input: AgentsMdInput,
  template: string = readFileSync(templateUrl, "utf8"),
): string {
  const values: Readonly<Record<string, string>> = {
    packageName: input.name,
    owner: input.owner,
    layer: input.layer,
    oneLinePurpose: input.purpose?.trim() || purposePlaceholder,
    apiNote: input.isFeature ? featureApiNote : "",
  };
  const filled = template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = values[key];
    if (value === undefined) {
      throw new Error(`package-AGENTS.md uses an unknown placeholder {{${key}}}.`);
    }
    return value;
  });
  return alignTables(filled);
}

/**
 * Pads every Markdown table to its widest cell, the way the formatter does, so
 * a generated file passes the formatting check whatever the package name is.
 */
function alignTables(text: string): string {
  const lines = text.split("\n");
  let start = 0;
  while (start < lines.length) {
    if (!lines[start]?.startsWith("|")) {
      start += 1;
      continue;
    }
    let end = start;
    while (lines[end]?.startsWith("|")) end += 1;
    const rows = lines.slice(start, end).map((line) =>
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
    );
    const widths =
      rows[0]?.map((_, col) => Math.max(...rows.map((row) => (row[col] ?? "").length))) ?? [];
    rows.forEach((row, index) => {
      const cells = widths.map((width, col) =>
        index === 1 ? "-".repeat(width) : (row[col] ?? "").padEnd(width),
      );
      lines[start + index] = `| ${cells.join(" | ")} |`;
    });
    start = end;
  }
  return lines.join("\n");
}
