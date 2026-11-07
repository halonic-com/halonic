import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";

/**
 * Checks that are wired in now and become real in Phase 1, so CI, `pnpm
 * check` and the docs already have their place. Each one passes until then.
 */
export const phaseOneSlots: Readonly<Record<string, string>> = {
  trace: "every active requirement has a test that ran and passed (plan 9.2)",
  "requirement-guard":
    "changing a requirement, golden file or test needs an approved decision note (plan 9.3)",
  dco: "every commit carries the sign-off the contribution policy asks for (plan 12)",
};

/** The rule for a slot: reports nothing until its Phase 1 version lands. */
export function slotRule(name: string): (context: CheckContext) => Report {
  return () => new Report(name);
}
