import { Avatar, agentTint, PlaceIcon } from "@halonicjs/studio-kit";
import type { RunPhase } from "../list/run-groups.ts";
import type { RunBy } from "./app-run.ts";

/**
 * Each state's corner dot colour (HAL-18594 rev 3, "Visual pass"): needs you in violet, failed in
 * `danger`, running in `running`, done in `success`, stopped muted.
 */
const dotColours: Readonly<Record<RunPhase, string>> = {
  "needs-you": "bg-warning",
  failed: "bg-danger",
  running: "bg-running",
  succeeded: "bg-success",
  stopped: "bg-fg-subtle",
};

/**
 * What ran, as a row's 28px tile: the agent's avatar in its own colour, as the Messenger shows it
 * (`runs.agent-tint`), or a workflow tile with the workflow icon,
 * with an 8px dot in the run's state colour on its bottom-right corner. The dot's 2px ring is the
 * row's background, so it stands clear of the tile. Decoration: the row's label says the state.
 */
export function RunTile({ by, phase }: { readonly by: RunBy; readonly phase: RunPhase }) {
  return (
    <span data-part="run-tile" className="relative inline-flex size-7 shrink-0">
      {by.kind === "agent" ? (
        <Avatar name={by.name} tint={by.id === undefined ? undefined : agentTint(by.id)} />
      ) : (
        <span className="inline-grid size-7 place-items-center rounded-full bg-surface-muted text-fg-muted">
          <span className="inline-grid size-icon-sm place-items-center *:size-full">
            <PlaceIcon name="workflows" />
          </span>
        </span>
      )}
      <span
        data-state={phase}
        className={`absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-surface ${dotColours[phase]}`}
      />
    </span>
  );
}
