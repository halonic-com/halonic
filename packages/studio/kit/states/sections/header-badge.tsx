import { HeaderBadge } from "../../src/header-badge/header-badge.tsx";
import type { PartSection } from "../state-table.tsx";

const ignore = () => undefined;

/** The sample chip and the trust badge, as in the first-run mockups. */
function Badges() {
  return (
    <div className="flex flex-wrap items-center gap-3 phone:w-full phone:flex-col phone:items-stretch phone:gap-0">
      <HeaderBadge
        as="menu"
        description="Runs on the built-in test model, with scripted replies. No key, no cost."
        entries={[
          { id: "real", label: "Use a real model…", onSelect: ignore },
          { id: "about", label: "About the sample", onSelect: ignore },
          { id: "remove", label: "Remove the sample", onSelect: ignore },
        ]}
        onOpenSheet={ignore}
      >
        Sample · test model
      </HeaderBadge>
      <HeaderBadge as="button" action="Review" onClick={ignore}>
        Not trusted yet
      </HeaderBadge>
    </div>
  );
}

export const headerBadgeSection: PartSection = {
  id: "header-badge",
  number: "20.1",
  name: "HeaderBadge",
  order: "kit 20.1, revision 17 · T1-F50, F52 · left to right: the sample chip, the trust badge",
  notApplicable:
    "disabled, error (a badge that can't do anything isn't shown), open (while its Menu is open, which this page can't hold)",
  rows: [
    { name: "Default", copies: () => <Badges /> },
    { name: "Hover", force: "hover", target: "button", copies: () => <Badges /> },
    { name: "Focus", force: "focus", target: "button", copies: () => <Badges /> },
  ],
};
