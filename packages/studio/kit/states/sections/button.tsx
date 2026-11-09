import { useId } from "react";
import { Button } from "../../src/button/button.tsx";
import { CloseIcon, PlusIcon } from "../icons.tsx";
import type { PartSection } from "../state-table.tsx";

/** The five copies of the sheet's Button row. `reason` makes every one of them unavailable. */
function Buttons({ reason }: { readonly reason?: string }) {
  const unavailable = reason === undefined ? {} : { unavailable: { reason } };
  return (
    <>
      <Button variant="primary" icon={<PlusIcon />} {...unavailable}>
        New agent
      </Button>
      <Button variant="secondary" {...unavailable}>
        Duplicate
      </Button>
      <Button variant="ghost" {...unavailable}>
        Cancel
      </Button>
      <Button variant="danger" {...unavailable}>
        Delete agent
      </Button>
      <Button variant="ghost" icon={<CloseIcon />} label="Close" {...unavailable} />
    </>
  );
}

/** Unavailable buttons point at a reason that is shown at full strength. */
function UnavailableButtons() {
  const reason = useId();
  return (
    <>
      <Buttons reason={reason} />
      <span id={reason} className="self-center text-small text-fg-muted">
        Add a model first.
      </span>
    </>
  );
}

export const buttonSection: PartSection = {
  id: "button",
  number: "1",
  name: "Button",
  order: "kit 1 · left to right: primary, secondary, ghost, danger, ghost icon button",
  notApplicable: "error (a toast or a field says it), read-only (fields only)",
  rows: [
    { name: "Default", copies: () => <Buttons /> },
    {
      name: "Sizes",
      copies: () => (
        <>
          <Button variant="primary" size="sm">
            sm
          </Button>
          <Button variant="primary">md</Button>
          <Button variant="primary" size="lg">
            lg
          </Button>
          <Button variant="primary" size="touch">
            touch
          </Button>
          <span className="self-center text-small text-fg-muted">28 · 32 · 40 · 48px</span>
        </>
      ),
    },
    { name: "Hover", force: "hover", copies: () => <Buttons /> },
    { name: "Focus", force: "focus", copies: () => <Buttons /> },
    { name: "Unavailable", copies: () => <UnavailableButtons /> },
    {
      name: "Busy",
      copies: () => (
        <>
          <Button variant="primary" busy>
            Saving…
          </Button>
          <Button variant="danger" busy>
            Deleting…
          </Button>
        </>
      ),
    },
  ],
};
