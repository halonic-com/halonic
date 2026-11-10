import { Field } from "../../src/field/field.tsx";
import { Switch } from "../../src/switch/switch.tsx";
import type { PartSection } from "../state-table.tsx";

const ignore = () => undefined;

/** Off and on, each with its sentence. */
function Settings({ unavailable = false }: { readonly unavailable?: boolean }) {
  const reason = unavailable ? { reason: "switch-reason" } : undefined;
  return (
    <div className="flex flex-col gap-2">
      <Switch checked={false} onChange={ignore} unavailable={reason}>
        Send a summary every morning
      </Switch>
      <Switch checked onChange={ignore} unavailable={reason}>
        Check for updates
      </Switch>
      {unavailable ? (
        <p id="switch-reason" className="text-small text-fg-muted">
          Finish getting updates first.
        </p>
      ) : null}
    </div>
  );
}

/** The switch only: the target for hover and focus. */
function Track({ checked = false }: { readonly checked?: boolean }) {
  return <Switch label="Turn on Sorter" checked={checked} onChange={ignore} />;
}

export const switchSection: PartSection = {
  id: "switch",
  number: "14",
  name: "Switch",
  order: "kit 14 · top to bottom: off, on",
  notApplicable: "read-only, busy, loading",
  rows: [
    { name: "Default", copies: () => <Settings /> },
    {
      name: "Hover",
      force: "hover",
      target: "input",
      copies: () => (
        <div className="flex gap-3">
          <Track />
          <Track checked />
        </div>
      ),
    },
    { name: "Focus", force: "focus", target: "input", copies: () => <Track /> },
    { name: "Unavailable", copies: () => <Settings unavailable /> },
    {
      name: "Error",
      copies: () => (
        <Field label="Summary" error="Couldn't save. Try again.">
          <Switch checked={false} onChange={ignore}>
            Send a summary every morning
          </Switch>
        </Field>
      ),
    },
  ],
};
