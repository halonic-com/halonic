import { Checkbox } from "../../src/checkbox/checkbox.tsx";
import { Field } from "../../src/field/field.tsx";
import type { PartSection } from "../state-table.tsx";

const ignore = () => undefined;

/** Unchecked, checked and mixed side by side, each with its words. */
function Choices({ unavailable = false }: { readonly unavailable?: boolean }) {
  const reason = unavailable ? { reason: "checkbox-reason" } : undefined;
  return (
    <div className="flex flex-col gap-2">
      <Checkbox checked={false} onChange={ignore} unavailable={reason}>
        Run on a schedule
      </Checkbox>
      <Checkbox checked onChange={ignore} unavailable={reason}>
        Send a summary
      </Checkbox>
      <Checkbox checked={false} indeterminate onChange={ignore} unavailable={reason}>
        All files
      </Checkbox>
      {unavailable ? (
        <p id="checkbox-reason" className="text-small text-fg-muted">
          Finish getting updates first.
        </p>
      ) : null}
    </div>
  );
}

/** The box only, as in a List row: the target for hover and focus. */
function Box() {
  return <Checkbox label="Select Sorter" checked={false} onChange={ignore} />;
}

export const checkboxSection: PartSection = {
  id: "checkbox",
  number: "14",
  name: "Checkbox",
  order: "kit 14 · top to bottom: unchecked, checked, mixed",
  notApplicable: "read-only, busy, loading",
  rows: [
    { name: "Default", copies: () => <Choices /> },
    { name: "Hover", force: "hover", target: "input", copies: () => <Box /> },
    { name: "Focus", force: "focus", target: "input", copies: () => <Box /> },
    { name: "Unavailable", copies: () => <Choices unavailable /> },
    {
      name: "Error",
      copies: () => (
        <Field label="Terms" error="Agree to the terms to go on.">
          <Checkbox checked={false} onChange={ignore}>
            I agree to the terms
          </Checkbox>
        </Field>
      ),
    },
  ],
};
