import { Field } from "../../src/field/field.tsx";
import { Input } from "../../src/input/input.tsx";
import { TextArea } from "../../src/input/text-area.tsx";
import type { PartSection } from "../state-table.tsx";

interface FieldsProps {
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  /** Each field shows its error instead of its hint. */
  readonly errors?: boolean;
}

/** The sheet's three fields: an empty Input with its placeholder, a filled one, a TextArea. */
function Fields({ disabled = false, readOnly = false, errors = false }: FieldsProps) {
  const control = { disabled, readOnly };
  return (
    <div className="flex w-80 flex-col gap-4 phone:w-full">
      <Field
        label="Name"
        hint="Shown in the sidebar"
        error={errors ? "Give the agent a name" : null}
      >
        <Input placeholder="Customer support" {...control} />
      </Field>
      <Field
        label="Name"
        hint="Shown in the sidebar"
        error={errors ? "Another agent is called Support bot" : null}
      >
        <Input defaultValue="Support bot" {...control} />
      </Field>
      <Field
        label="Instructions"
        hint="What the agent does, in your words"
        error={errors ? "Keep it under 4,000 characters" : null}
      >
        <TextArea
          defaultValue="Answer customer mail in a friendly tone. Ask before you refund anything."
          {...control}
        />
      </Field>
    </div>
  );
}

export const fieldSection: PartSection = {
  id: "field",
  number: "2, 3",
  name: "Field and Input",
  order:
    "kit 2, 3 · top to bottom: an empty Input with its placeholder, a filled Input, a TextArea",
  notApplicable: "busy (buttons only)",
  rows: [
    { name: "Default", copies: () => <Fields /> },
    { name: "Hover", force: "hover", copies: () => <Fields /> },
    { name: "Focus", force: "focus", copies: () => <Fields /> },
    { name: "Disabled", copies: () => <Fields disabled /> },
    { name: "Error", copies: () => <Fields errors /> },
    { name: "Read-only", copies: () => <Fields readOnly /> },
  ],
};
