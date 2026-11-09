import { Button } from "../../src/button/button.tsx";
import { Window, WindowBar } from "../../src/window/window.tsx";
import type { PartSection } from "../state-table.tsx";

const file = "workflows/review.yaml";

function Copy() {
  return (
    <Button variant="ghost" size="sm">
      Copy
    </Button>
  );
}

function FileText() {
  return (
    <pre className="p-4 font-mono text-code text-fg">
      {"name: review\nsteps:\n  - agent: reviewer"}
    </pre>
  );
}

export const windowSection: PartSection = {
  id: "window",
  number: "theme",
  name: "WindowBar and Window",
  order: "site theme (HAL-1687) · a bar on its own, then the bar in a frame",
  notApplicable: "hover, focus, disabled (not interactive; its buttons have their own)",
  rows: [
    {
      name: "Default",
      copies: () => (
        <div className="grid w-96 gap-4 phone:w-full">
          <WindowBar title={file} actions={<Copy />} />
          <Window title={file}>
            <FileText />
          </Window>
        </div>
      ),
    },
    {
      name: "Long title",
      copies: () => (
        <div className="w-64 phone:w-full">
          <WindowBar
            title="workspaces/support/workflows/review-incoming-mail.yaml"
            actions={<Copy />}
          />
        </div>
      ),
    },
  ],
};
