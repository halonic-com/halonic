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

/**
 * The window clips its content, so a file scrolls itself: `tabIndex` lets a keyboard user focus
 * and scroll it, and the inset ring stays inside the clip.
 */
function FileText({ text }: { text: string }) {
  return (
    <pre
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must be focusable to scroll by keyboard
      tabIndex={0}
      className="overflow-x-auto p-4 font-mono text-code text-fg focus-ring-inset"
    >
      {text}
    </pre>
  );
}

const shortFile = "name: review\nsteps:\n  - agent: reviewer";
const longFile =
  "name: review\nsteps:\n  - agent: reviewer\n    prompt: Read the incoming mail, sort it by customer and draft a reply for each one";

export const windowSection: PartSection = {
  id: "window",
  number: "26.1",
  name: "WindowBar and Window",
  order: "kit 26.1 · a bar on its own, then the bar in a frame",
  notApplicable:
    "hover, focus, disabled (not interactive; its buttons and its scrolling content have their own)",
  rows: [
    {
      name: "Default",
      copies: () => (
        <div className="grid w-96 gap-4 phone:w-full">
          <WindowBar title={file} actions={<Copy />} />
          <Window title={file} actions={<Copy />}>
            <FileText text={shortFile} />
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
    {
      name: "Long line",
      copies: () => (
        <div className="w-96 phone:w-full">
          <Window title={file}>
            <FileText text={longFile} />
          </Window>
        </div>
      ),
    },
  ],
};
