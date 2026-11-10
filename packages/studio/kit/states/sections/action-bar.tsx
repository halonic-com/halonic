import { ActionBar } from "../../src/action-bar/action-bar.tsx";
import type { PartSection } from "../state-table.tsx";

/** The decision bar from an Inbox card, in a 328px column like a 360px phone's. */
function DecisionBar({ busy = false }: { readonly busy?: boolean }) {
  return (
    <div className="w-82 phone:w-full">
      <ActionBar
        note={{ text: "Sending is off until you connect Gmail.", tone: "warning" }}
        rows={[
          [{ label: "Approve", variant: "primary", busy, busyLabel: "Approving…" }],
          [{ label: "Ask for changes" }, { label: "Reject" }],
        ]}
      />
    </div>
  );
}

export const actionBarSection: PartSection = {
  id: "action-bar",
  number: "15.4",
  name: "ActionBar",
  order: "kit 15.4 · the decision bar with a note, 328px wide (a 360px phone's column)",
  notApplicable: "error (a failed decision shows a toast or a callout, not a red bar)",
  rows: [
    { name: "Default", copies: () => <DecisionBar /> },
    { name: "Hover", force: "hover", target: "button", copies: () => <DecisionBar /> },
    { name: "Focus", force: "focus", target: "button", copies: () => <DecisionBar /> },
    { name: "Busy", copies: () => <DecisionBar busy /> },
  ],
};
