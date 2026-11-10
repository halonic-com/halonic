import { Field } from "../../src/field/field.tsx";
import { FormRows } from "../../src/field/form-rows.tsx";
import { Input } from "../../src/input/input.tsx";
import { TextArea } from "../../src/input/text-area.tsx";
import type { PartSection } from "../state-table.tsx";

/** A Skill page's rows: a name, wide instructions and a read-only text value. */
function Rows({ errors = false }: { readonly errors?: boolean }) {
  return (
    <div className="w-200 max-w-full">
      <FormRows>
        <Field
          label="Name"
          hint="Shown in the sidebar"
          error={errors ? "Give the skill a name" : null}
          required
        >
          <Input defaultValue={errors ? "" : "Sorter"} />
        </Field>
        <Field label="Instructions" wide>
          <TextArea defaultValue="Sort incoming mail into the right folder. Ask when unsure." />
        </Field>
        <Field label="Used by" align="text">
          <p className="text-body text-fg">Support bot, Inbox triage</p>
        </Field>
      </FormRows>
    </div>
  );
}

/** A routine's When card: the tighter rows without lines, wide enough for its 120px labels. */
function CardRows() {
  return (
    <div className="w-130 max-w-full rounded-md border border-border bg-surface p-4">
      <FormRows inCard>
        <Field label="Every">
          <Input defaultValue="Weekday" />
        </Field>
        <Field label="At">
          <Input defaultValue="09:00" />
        </Field>
      </FormRows>
    </div>
  );
}

export const formRowsSection: PartSection = {
  id: "form-rows",
  number: "19.2",
  name: "FormRows",
  order:
    "kit 19.2 · top to bottom: a Skill page's rows, then a routine card's rows; light above dark, so each copy has the width for its labels beside the values; under 46.5rem (28rem in a card) every Field stacks",
  notApplicable: "hover, disabled, read-only, busy (the controls inside have them)",
  stacked: true,
  rows: [
    { name: "Default", copies: () => [<Rows key="page" />, <CardRows key="card" />] },
    { name: "Focus", force: "focus", copies: () => <Rows /> },
    { name: "Error", copies: () => <Rows errors /> },
  ],
};
