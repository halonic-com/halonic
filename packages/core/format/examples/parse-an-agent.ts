import { compact, parseFile } from "../src/index.ts";

/** Parses a good and a bad agent file, and drops empty values before saving. */
export function runExample(): {
  name: string | undefined;
  warnings: number;
  problems: string[];
  saved: unknown;
} {
  // The id is the file name without its suffix: agents/clerk.agent.yaml.
  const good = parseFile("agent", "name: Clerk\n", { id: "clerk" });
  const name = good.ok ? good.value.value.name : undefined; // "Clerk"
  const warnings = good.ok ? good.value.warnings.length : 0; // 0

  // A bad file gives every problem, each with a path, a line and a column.
  const bad = parseFile("agent", "name: Clerk\noutput:\n  type: xml\n", { id: "clerk" });
  const problems = bad.ok
    ? []
    : bad.error.map(
        (problem) => `${problem.source} ${problem.code} at ${problem.line}:${problem.col}`,
      );

  // compact drops empty values before a file is written, as the old app did.
  const saved = compact({ name: "Clerk", tools: [], notes: undefined, output: { type: "text" } }); // { name: "Clerk", output: { type: "text" } }
  return { name, warnings, problems, saved };
}
