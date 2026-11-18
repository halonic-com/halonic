import { CodeDisplay } from "../../src/code-display/code-display.tsx";
import type { PartSection } from "../state-table.tsx";

export const codeDisplaySection: PartSection = {
  id: "code-display",
  number: "26.3",
  name: "CodeDisplay",
  order: "tunnel phase B · top to bottom: the check code (lg), a typed code (md)",
  notApplicable: "hover, focus, disabled, error (shown, not interactive)",
  rows: [
    {
      name: "Default",
      copies: () => (
        <div className="flex w-80 flex-col gap-4 phone:w-full">
          <CodeDisplay code="4F72KQ" group={3} label="Check code" />
          <CodeDisplay code="7KQ2M4XD9TH6" group={4} size="md" label="Pairing code" />
        </div>
      ),
    },
  ],
};
