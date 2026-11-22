import { agentCantRunWords, type RoutineListing, type RoutineView } from "./api.ts";
import { cantStartWords } from "./cant-start-words.ts";

export { cantStartWords };

/** The routine facts that decide whether it can start. */
export type StartFacts = Pick<
  RoutineListing,
  "targetFound" | "targetName" | "targetKind" | "problems"
>;

/**
 * Why the routine can't start, or `undefined` when it can. A missing workflow or agent comes first,
 * because picking another one is the fix; then an agent on its own, which Halonic can't run yet,
 * in the words its Starts card gives (HAL-15607); otherwise the first error the workspace's checks
 * found in its file, as `halonic validate` gives it, since `halonic routines` counts any of them as
 * can't start.
 */
export function cantStartReason(facts: StartFacts): string | undefined {
  if (!facts.targetFound) return cantStartWords.targetMissing(facts.targetName, facts.targetKind);
  if (facts.targetKind === "agent") return agentCantRunWords.line;
  return facts.problems[0];
}

/**
 * The same facts read from the routine's page, so its Starts card says what its row says
 * (HAL-15300). A workflow or agent that isn't there is named by its id, as the row names it.
 */
export function pageStartFacts(
  routine: Pick<RoutineView, "target" | "targetState" | "problems">,
): StartFacts {
  return {
    targetFound: routine.targetState !== "not-found",
    targetName: routine.target.id,
    targetKind: routine.target.kind,
    problems: routine.problems,
  };
}

/** {@link cantStartReason} for a routine as its page reads it, so its Runs view agrees with its row. */
export function viewCantStartReason(routine: RoutineView): string | undefined {
  return cantStartReason({
    targetFound: routine.targetState !== "not-found",
    targetName: routine.targetName,
    targetKind: routine.target.kind,
    problems: routine.startErrors ?? [],
  });
}
