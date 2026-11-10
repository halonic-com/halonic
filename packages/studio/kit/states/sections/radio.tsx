import { Field } from "../../src/field/field.tsx";
import { Input } from "../../src/input/input.tsx";
import { RadioGroup, type RadioOption } from "../../src/radio/radio-group.tsx";
import type { PartSection } from "../state-table.tsx";

const ignore = () => undefined;

const ways: readonly RadioOption[] = [
  {
    value: "address",
    label: "Web address",
    field: <Input defaultValue="https://mcp.acme.test" aria-label="Address" />,
  },
  { value: "command", label: "Local command", note: "Runs a program on this computer." },
  { value: "docker", label: "Docker image", note: "Needs Docker.", unavailable: true },
];

/** New connector's three ways to connect, the first picked with its field under it. */
function Ways({ value = "address" }: { readonly value?: string | null }) {
  return (
    <div className="w-80 phone:w-full">
      <Field label="Connect with">
        <RadioGroup options={ways} value={value} onChange={ignore} />
      </Field>
    </div>
  );
}

export const radioSection: PartSection = {
  id: "radio",
  number: "19.1",
  name: "Radio",
  order: "kit 19.1 · top to bottom: picked with its field, a note, unavailable with its note",
  notApplicable: "read-only, busy, loading",
  rows: [
    { name: "Default", copies: () => <Ways /> },
    { name: "Hover", force: "hover", target: "input[value='command']", copies: () => <Ways /> },
    { name: "Focus", force: "focus", target: "input[value='address']", copies: () => <Ways /> },
    {
      name: "Error",
      copies: () => (
        <div className="w-80 phone:w-full">
          <Field label="Connect with" error="Pick a way to connect.">
            <RadioGroup options={ways} value={null} onChange={ignore} />
          </Field>
        </div>
      ),
    },
  ],
};
