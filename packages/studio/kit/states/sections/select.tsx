import { Field } from "../../src/field/field.tsx";
import { Select, type SelectOption } from "../../src/select/select.tsx";
import type { PartSection } from "../state-table.tsx";

const ignore = () => undefined;

const models: readonly SelectOption[] = [
  { value: "sonnet", label: "Sonnet" },
  { value: "haiku", label: "Haiku" },
];

interface ModelsProps {
  readonly disabled?: boolean;
  /** The second field names a model that no longer exists. */
  readonly errors?: boolean;
}

/** A picked model, and one with the placeholder: a value the file names that no longer exists. */
function Models({ disabled = false, errors = false }: ModelsProps) {
  return (
    <div className="flex w-80 flex-col gap-4 phone:w-full">
      <Field label="Model" hint="Used by new agents">
        <Select options={models} value="sonnet" onChange={ignore} disabled={disabled} />
      </Field>
      <Field
        label="Model for summaries"
        hint="Used by the summary step"
        error={errors ? "smart no longer exists. Choose another model." : null}
      >
        <Select
          options={models}
          value="smart"
          onChange={ignore}
          placeholder="Choose a model"
          disabled={disabled}
        />
      </Field>
    </div>
  );
}

export const selectSection: PartSection = {
  id: "select",
  number: "4",
  name: "Select",
  order: "kit 4 · top to bottom: a picked value, the placeholder. Below 600px the picker button",
  notApplicable: "read-only (a native select has none), busy (buttons only)",
  rows: [
    { name: "Default", copies: () => <Models /> },
    { name: "Hover", force: "hover", copies: () => <Models /> },
    { name: "Focus", force: "focus", copies: () => <Models /> },
    { name: "Disabled", copies: () => <Models disabled /> },
    { name: "Error", copies: () => <Models errors /> },
  ],
};
