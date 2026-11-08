import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";

/**
 * Checks that are wired in now and are not active yet, so CI, `pnpm
 * check` and the docs already have their place. Each one passes until its real
 * version lands.
 */
export const inactiveChecks: Readonly<Record<string, string>> = {
  "requirement-guard":
    "changing a requirement, golden file or test needs an approved decision note",
};

/** The rule for an inactive check: reports nothing until its real version lands. */
export function inactiveRule(name: string): (context: CheckContext) => Report {
  return () => new Report(name);
}
