import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";

/**
 * Checks that are wired in now and are not active yet, so CI, `pnpm
 * check` and the docs already have their place. Each one passes until its real
 * version lands.
 */
export const phaseOneSlots: Readonly<Record<string, string>> = {
  trace: "every active requirement has a test that ran and passed",
  "requirement-guard":
    "changing a requirement, golden file or test needs an approved decision note",
  dco: "every commit carries the sign-off the contribution policy asks for",
};

/** The rule for a slot: reports nothing until its real version lands. */
export function slotRule(name: string): (context: CheckContext) => Report {
  return () => new Report(name);
}
