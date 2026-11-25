import { ConfirmAgainCallouts } from "@halonicjs/studio-feature-agents/api";
import { SandboxCantRunCallout } from "@halonicjs/studio-feature-runs/api";
import type { ComponentProps } from "react";
import { ProgramStepsLine, programAgentsOf } from "./program-steps-line.tsx";
import type { useRunGate } from "./run-gate.ts";
import { ProblemsBand, StartRow } from "./start-row.tsx";

/** Props for {@link WorkflowBands}. */
export interface WorkflowBandsProps {
  readonly name: string;
  readonly hubId: string;
  readonly phone: boolean;
  /** The problems band's own props, but those the bands share. */
  readonly problemsBand: Omit<ComponentProps<typeof ProblemsBand>, "name" | "openAgent">;
  /** Whether a run can start, and the program steps that keep it from starting. */
  readonly gate: ReturnType<typeof useRunGate>;
  /** The start row's own props, but the name. */
  readonly startRow: Omit<ComponentProps<typeof StartRow>, "name">;
  readonly agents: ComponentProps<typeof ConfirmAgainCallouts>["host"];
  readonly reviewAndConfirm: ComponentProps<typeof ConfirmAgainCallouts>["reviewAndConfirm"];
  readonly openAgent: ComponentProps<typeof ProgramStepsLine>["openAgent"];
  readonly announce: ComponentProps<typeof SandboxCantRunCallout>["announce"];
  /** Where focus goes once the sandbox can run: the Run button, else the title. */
  readonly onSandboxReady: () => void;
}

/**
 * The bands under the workflow page's header, in the order the page shows them: its problems,
 * why the sandbox can't run, the agents to confirm again, and why a run can't start.
 */
export function WorkflowBands({
  name,
  hubId,
  phone,
  problemsBand,
  gate,
  startRow,
  agents,
  reviewAndConfirm,
  openAgent,
  announce,
  onSandboxReady,
}: WorkflowBandsProps) {
  return (
    <>
      <ProblemsBand name={name} openAgent={openAgent} {...problemsBand} />
      <SandboxCantRunCallout
        name={name}
        start={gate.sandbox}
        firstLineId={gate.cantRunId}
        announce={announce}
        onReady={onSandboxReady}
        band
      >
        <ProgramStepsLine steps={gate.programSteps} phone={phone} openAgent={openAgent} />
      </SandboxCantRunCallout>
      {/* Below the can't-run Callout; it never disables Run (agents.confirm-again.run-controls). */}
      <ConfirmAgainCallouts
        host={agents}
        hubId={hubId}
        agents={programAgentsOf(gate.programSteps)}
        reviewAndConfirm={reviewAndConfirm}
      />
      {/* With a Run button, the page starts it itself, so the terminal line would only repeat it. */}
      <StartRow name={name} {...startRow} />
    </>
  );
}
