import { RailButton } from "../../src/rail-button/rail-button.tsx";
import { FlowIcon, ListIcon, SlidersIcon } from "../icons.tsx";
import type { PartSection } from "../state-table.tsx";

/** Three apps on a strip of the rail's colour; Runs counts 2 unread, Flows is picked when asked. */
function SampleRail({ flowsSelected = false }: { readonly flowsSelected?: boolean }) {
  const ignore = () => undefined;
  return (
    <div className="flex flex-col gap-1 rounded-sm bg-canvas px-3 py-2.5">
      <RailButton
        label="Flows"
        icon={() => <FlowIcon />}
        selected={flowsSelected}
        onSelect={ignore}
      />
      <RailButton
        label="Runs"
        icon={() => <ListIcon />}
        selected={false}
        onSelect={ignore}
        count={{ value: 2, name: "2 unread" }}
      />
      <RailButton
        label="Settings"
        icon={() => <SlidersIcon />}
        selected={false}
        onSelect={ignore}
      />
    </div>
  );
}

/** Hover and focus go on the last button, which has no badge. */
const lastButton = "button:last-of-type";

export const railButtonSection: PartSection = {
  id: "rail-button",
  number: "26.7",
  name: "RailButton",
  order:
    "kit 26.7 · top to bottom: Flows, Runs with 2 unread, Settings. Hover and focus on Settings",
  notApplicable: "disabled (an app the folder doesn't have is left out), error, busy",
  rows: [
    { name: "Default", copies: () => <SampleRail /> },
    { name: "Hover", force: "hover", target: lastButton, copies: () => <SampleRail /> },
    { name: "Focus", force: "focus", target: lastButton, copies: () => <SampleRail /> },
    { name: "Selected", copies: () => <SampleRail flowsSelected /> },
  ],
};
