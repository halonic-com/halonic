/** What starts the `step` that asks a workflow's page to outline steps; see {@link selectStepsStep}. */
const SELECT_STEPS = "select:";

/**
 * The `step` that opens a workflow's page on Flow with these steps outlined and no step card open
 * (flow-workflows 9, `select`), as the agent map's workflow card opens it: `select:` and the ids,
 * each URI-encoded, comma-separated. The Workflows feature reads it back with {@link stepsToSelect}.
 * It lives here because Workflows imports Agents and not the other way round.
 */
export function selectStepsStep(stepIds: readonly string[]): string {
  return SELECT_STEPS + stepIds.map(encodeURIComponent).join(",");
}

/** The steps a {@link selectStepsStep} step asks to outline; `undefined` for any other step or none. */
export function stepsToSelect(step: string | undefined): readonly string[] | undefined {
  if (step === undefined || !step.startsWith(SELECT_STEPS)) return undefined;
  const ids = step.slice(SELECT_STEPS.length);
  try {
    return ids === "" ? [] : ids.split(",").map(decodeURIComponent);
  } catch {
    return undefined;
  }
}
