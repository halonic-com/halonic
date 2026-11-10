import { Field } from "../../src/field/field.tsx";
import { Input } from "../../src/input/input.tsx";
import type { PartSection } from "../state-table.tsx";

const ignore = () => undefined;

interface ColourProps {
  readonly value?: string;
  readonly error?: string | null;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
}

/**
 * The settings feature's first colour field. The swatch is the feature's (a 16px square with a
 * control edge, in the last good colour); the page fills it `primary`, which is close enough to
 * #3B8BFF to stand for it without writing a colour outside the theme.
 */
function Colour({
  value = "#3B8BFF",
  error = null,
  disabled = false,
  readOnly = false,
}: ColourProps) {
  return (
    <div className="w-80 phone:w-full">
      <Field label="First colour" error={error}>
        <Input
          defaultValue={value}
          disabled={disabled}
          readOnly={readOnly}
          leadingButton={{
            label: "Choose the first colour, now #3B8BFF",
            onClick: ignore,
            children: (
              <span className="size-4 rounded-xs border border-border-control bg-primary" />
            ),
          }}
        />
      </Field>
    </div>
  );
}

export const inputLeadingSection: PartSection = {
  id: "input-leading",
  number: "3",
  name: "Input: the leading button",
  order: "kit 3, revision 14 · T1-F46",
  notApplicable: "busy, loading",
  rows: [
    { name: "Default", copies: () => <Colour /> },
    { name: "Hover", force: "hover", target: ".focus-field", copies: () => <Colour /> },
    { name: "Focus on the button", force: "focus", target: "button", copies: () => <Colour /> },
    { name: "Focus in the text", force: "focus", target: ".focus-field", copies: () => <Colour /> },
    {
      name: "Error",
      copies: () => <Colour value="#3B8BF" error="Use six digits, like #3B8BFF." />,
    },
    { name: "Disabled", copies: () => <Colour disabled /> },
    { name: "Read-only", copies: () => <Colour readOnly /> },
  ],
};
