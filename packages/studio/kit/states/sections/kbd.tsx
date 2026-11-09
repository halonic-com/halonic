import { Kbd } from "../../src/kbd/kbd.tsx";
import type { PartSection } from "../state-table.tsx";
import { MutedFill } from "./status-chip.tsx";

/** Kbd hides itself on a phone, so the phone band says so where the keys would be. */
function Shortcuts() {
  return (
    <>
      <Kbd keys={["Ctrl", "K"]} />
      <Kbd keys={["Ctrl", "Shift", "T"]} />
      <span className="hidden text-small text-fg-muted phone:inline">Hidden on a phone</span>
    </>
  );
}

export const kbdSection: PartSection = {
  id: "kbd",
  number: "14",
  name: "Kbd",
  order: "kit 14 · left to right: Ctrl K, Ctrl Shift T",
  notApplicable: "hover, focus, disabled (not interactive). In a tooltip: comes with the Tooltip",
  rows: [
    { name: "Default", copies: () => <Shortcuts /> },
    {
      name: "On a muted fill",
      copies: () => (
        <MutedFill>
          <Shortcuts />
        </MutedFill>
      ),
    },
  ],
};
