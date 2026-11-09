import type { ReactNode } from "react";
import { StatusChip } from "../../src/status-chip/status-chip.tsx";
import type { PartSection } from "../state-table.tsx";

/** The sheet's eight chips, in its order. */
function Chips() {
  return (
    <>
      <StatusChip tone="neutral">Draft</StatusChip>
      <StatusChip tone="accent">3 new</StatusChip>
      <StatusChip tone="running" dot>
        Running
      </StatusChip>
      <StatusChip tone="warning" dot>
        Needs you
      </StatusChip>
      <StatusChip tone="danger" dot>
        Failed
      </StatusChip>
      <StatusChip tone="success" dot>
        Done
      </StatusChip>
      <StatusChip tone="neutral" shape="count" name="3 waiting">
        3
      </StatusChip>
      <StatusChip tone="outline">Test</StatusChip>
    </>
  );
}

/**
 * A surface-muted fill, like an unselected tab or a hovered row, that turns on the parts' on-muted:
 * look. Kbd's section uses it too.
 */
export function MutedFill({ children }: { readonly children: ReactNode }) {
  return (
    <div
      data-fill="muted"
      className="flex flex-wrap items-center gap-3 rounded-sm bg-surface-muted p-2"
    >
      {children}
    </div>
  );
}

export const statusChipSection: PartSection = {
  id: "status-chip",
  number: "10",
  name: "Status chip",
  order:
    "kit 10 · left to right: neutral, accent, running, warning, danger, success, a neutral count, the Test tag",
  notApplicable: "hover, focus, disabled (not interactive)",
  rows: [
    { name: "Tones", copies: () => <Chips /> },
    {
      name: "On a muted fill",
      copies: () => (
        <MutedFill>
          <Chips />
        </MutedFill>
      ),
    },
  ],
};
