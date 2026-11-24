import { Callout } from "@halonicjs/studio-kit";
import { agentCantRunWords, type RoutineView } from "../api.ts";

/**
 * The notice of a routine that starts an agent (`routines.page.agent-routine-notice`): Halonic
 * can't run an agent on its own yet, so the routine won't start until it runs a workflow, with
 * **Pick what it runs**. Nothing for a routine that starts a workflow. The routine's file stays as
 * it is: the notice changes nothing in it.
 */
export function AgentRoutineNotice({
  routine,
  noticeId,
  onPick,
}: {
  readonly routine: RoutineView;
  /** The `id` of the notice's sentence, which describes Run now and Runs on its own. */
  readonly noticeId: string;
  /** Shows the Starts picker, for **Pick what it runs**. */
  readonly onPick: () => void;
}) {
  if (!startsAgent(routine)) return null;
  return (
    <Callout tone="info" action={{ label: agentCantRunWords.pickWhatItRuns, onClick: onPick }}>
      <span id={noticeId}>{agentCantRunWords.routineNotice}</span>
    </Callout>
  );
}

/** Whether the routine starts an agent rather than a workflow, which Halonic can't run yet. */
export function startsAgent(routine: Pick<RoutineView, "target"> | undefined): boolean {
  return routine?.target.kind === "agent";
}
