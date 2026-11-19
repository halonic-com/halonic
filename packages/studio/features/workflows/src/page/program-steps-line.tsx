import { inlineLinkClasses } from "@halonicjs/studio-kit";
import type { WorkflowStep, WorkflowStepProgram, WorkflowView } from "../api.ts";
import { pageWords } from "./page-words.ts";

/** A step that runs an agent in a program of its own, which needs the sandbox. */
export type ProgramStep = WorkflowStep & { readonly program: WorkflowStepProgram };

/** The workflow's steps that start a program, in the file's order. */
export function programStepsOf(workflow: WorkflowView | undefined): readonly ProgramStep[] {
  return (workflow?.steps ?? []).filter((step): step is ProgramStep => step.program !== undefined);
}

/** A step as the Runs row names it: its own words for itself, else its id with a capital. */
function stepName(step: WorkflowStep): string {
  return step.title ?? `${step.id.charAt(0).toUpperCase()}${step.id.slice(1)}`;
}

/**
 * The can't-run Callout's last line on the workflow page (microcopy 23.3): the first step that
 * starts a program and its program, or how many others do too, then where its agent's setting is.
 * On a phone the setting can't be changed, so the line says to use the computer, with no link.
 */
export function ProgramStepsLine({
  steps,
  phone,
  openAgent,
}: {
  readonly steps: readonly ProgramStep[];
  readonly phone: boolean;
  /** Opens the agent's page; without it the line names the agent with no link. */
  readonly openAgent?: ((agentId: string) => void) | undefined;
}) {
  const [first] = steps;
  if (first === undefined) return null;
  const words = pageWords.cantRun;
  const { agent, agentName, harness } = first.program;
  const uses =
    steps.length === 1
      ? words.programStep(stepName(first), words.programs[harness])
      : words.programSteps(stepName(first), steps.length - 1);
  if (phone) return <>{`${uses} ${words.onYourComputer(agentName)}`}</>;
  return (
    <>
      {`${uses} ${words.changeIn(agentName)} `}
      {openAgent === undefined ? (
        words.agentSettings(agentName)
      ) : (
        <button type="button" className={inlineLinkClasses} onClick={() => openAgent(agent)}>
          {words.agentSettings(agentName)}
        </button>
      )}
    </>
  );
}
