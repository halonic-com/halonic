import { HeaderBadge } from "../../src/header-badge/header-badge.tsx";
import { HeaderBadgeSheet } from "../../src/header-badge/header-badge-sheet.tsx";
import { PresentationProvider } from "../../src/presentation/presentation.tsx";
import type { PartSection } from "../state-table.tsx";

const ignore = () => undefined;

const costLine = "Runs on the built-in test model, with scripted replies. No key, no cost.";

/** The sample chip and the trust badge, as in the first-run mockups. */
function Badges() {
  return (
    <div className="flex flex-wrap items-center gap-3 phone:w-full phone:flex-col phone:items-stretch phone:gap-0">
      <HeaderBadge
        as="menu"
        description={costLine}
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

/** The sample chip's menu as the phone's panel sheet, in a 328px by 320px frame. */
function Sheet() {
  return (
    <div className="h-80 w-82 overflow-hidden rounded-sm border border-border phone:w-full">
      <PresentationProvider presentation="phone">
        <HeaderBadgeSheet
          title="Sample · test model"
          description={costLine}
          entries={[
            { id: "real", label: "Use a real model…", onSelect: ignore },
            { id: "about", label: "About the sample", onSelect: ignore },
            { id: "remove", label: "Remove the sample", onSelect: ignore },
          ]}
          onClose={ignore}
        />
      </PresentationProvider>
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
    { name: "Menu on a phone (T1-F51)", copies: () => <Sheet /> },
  ],
};
