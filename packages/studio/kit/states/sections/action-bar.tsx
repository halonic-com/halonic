import { ActionBar } from "../../src/action-bar/action-bar.tsx";
import { type DecisionEvent, decisionRows } from "../../src/action-bar/decision-rows.ts";
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

const approve: DecisionEvent = { label: "Approve", busyLabel: "Approving…" };
const remember: DecisionEvent = { label: "Approve and remember" };
const ask: DecisionEvent = { label: "Ask for changes" };
const reject: DecisionEvent = { label: "Reject" };

/** A wait step's decision bar (20.6), laid out from its events by `decisionRows`. */
function WaitStepBar({ events }: { readonly events: readonly DecisionEvent[] }) {
  return (
    <div className="w-82 phone:w-full">
      <ActionBar rows={decisionRows(events)} />
    </div>
  );
}

export const actionBarSection: PartSection = {
  id: "action-bar",
  number: "15.4",
  name: "ActionBar",
  order:
    "kit 15.4, 20.6 · T1-F53 · the decision bar with a note, then a wait step's bar from its events; 328px wide (a 360px phone's column)",
  notApplicable: "error (a failed decision shows a toast or a callout, not a red bar)",
  rows: [
    { name: "Default", copies: () => <DecisionBar /> },
    { name: "Hover", force: "hover", target: "button", copies: () => <DecisionBar /> },
    { name: "Focus", force: "focus", target: "button", copies: () => <DecisionBar /> },
    { name: "Busy", copies: () => <DecisionBar busy /> },
    { name: "Wait step, one event", copies: () => <WaitStepBar events={[approve]} /> },
    { name: "Wait step, two events", copies: () => <WaitStepBar events={[approve, reject]} /> },
    {
      name: "Wait step, three events",
      copies: () => <WaitStepBar events={[approve, ask, reject]} />,
    },
    {
      name: "Wait step, four events",
      copies: () => <WaitStepBar events={[approve, remember, ask, reject]} />,
    },
    {
      name: "Wait step, deciding",
      copies: () => <WaitStepBar events={[{ ...approve, busy: true }, ask, reject]} />,
    },
  ],
};
