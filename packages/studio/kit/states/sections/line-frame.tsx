import { InfoIcon } from "../../src/icons/info-icon.tsx";
import { LineFrame } from "../../src/line-frame/line-frame.tsx";
import type { PartSection } from "../state-table.tsx";

/** The Changes feature's sharing strip, drawn with a kit icon in place of its own. */
function Strips() {
  const turnOn = { label: "Turn on", onClick: () => undefined };
  return (
    <div className="flex w-full max-w-105 flex-col">
      <LineFrame icon={<InfoIcon />} action={turnOn}>
        Sharing is off for this workspace.
      </LineFrame>
      <LineFrame icon={<InfoIcon />} action={turnOn}>
        Sharing is off for this workspace. Turn it on to send these changes to your team.
      </LineFrame>
    </div>
  );
}

export const lineFrameSection: PartSection = {
  id: "line-frame",
  number: "18.4",
  name: "LineFrame with an action",
  order: "kit 18.4 · top to bottom: a one-line strip, a strip whose text wraps",
  notApplicable: "disabled, error (the feature hides an action it can't take)",
  rows: [
    { name: "Default", copies: () => <Strips /> },
    { name: "Hover", force: "hover", target: "button", copies: () => <Strips /> },
    { name: "Focus", force: "focus", target: "button", copies: () => <Strips /> },
  ],
};
