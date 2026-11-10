import { ViewOnlyLine } from "../../src/view-only-line/view-only-line.tsx";
import type { PartSection } from "../state-table.tsx";

export const viewOnlyLineSection: PartSection = {
  id: "view-only-line",
  number: "15.6, 18.4",
  name: "ViewOnlyLine",
  order: "kit 15.6 on the LineFrame (18.4) · top to bottom: Memory, a workflow, a harness",
  notApplicable: "hover, focus, disabled, error (a plain line with no action)",
  rows: [
    {
      name: "Default",
      copies: () => (
        <div className="flex w-full flex-col">
          <ViewOnlyLine>View only on a phone.</ViewOnlyLine>
          <ViewOnlyLine>View only on a phone. Edit this workflow on a computer.</ViewOnlyLine>
          <ViewOnlyLine>
            View only on a phone. Change the harness and where it runs on a computer.
          </ViewOnlyLine>
        </div>
      ),
    },
  ],
};
