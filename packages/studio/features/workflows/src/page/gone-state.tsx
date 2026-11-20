import { ItemGone } from "@halonicjs/studio-shell";
import type { ReactNode } from "react";
import type { useWorkflow } from "./use-workflow.ts";

/**
 * A workflow deleted or renamed outside, or a link to one that never was: the item-gone state
 * instead of an error, since Try again can't bring it back (microcopy 2 "Item gone").
 */
export function goneState(
  load: ReturnType<typeof useWorkflow>["load"],
  goToWorkflows: (() => void) | undefined,
): ReactNode {
  if (load.kind !== "failed" || load.gone !== true || goToWorkflows === undefined) return undefined;
  return <ItemGone kindName="workflow" place="Workflows" onGoTo={goToWorkflows} />;
}
