import { Field } from "../../src/field/field.tsx";
import { Slider } from "../../src/slider/slider.tsx";
import type { PartSection } from "../state-table.tsx";

const ignore = () => undefined;
const percent = (value: number) => `${value}%`;

interface OpacityProps {
  readonly value?: number;
  readonly error?: string | null;
  readonly unavailable?: boolean;
}

/** Appearance's panel opacity, 10 to 100%. */
function Opacity({ value = 40, error = null, unavailable = false }: OpacityProps) {
  return (
    <div className="w-80 phone:w-full">
      <Field label="Panel opacity" error={error}>
        <Slider
          min={10}
          max={100}
          value={value}
          onChange={ignore}
          onCommit={ignore}
          format={percent}
          unavailable={unavailable ? { reason: "slider-reason" } : undefined}
        />
      </Field>
      {unavailable ? (
        <p id="slider-reason" className="text-small text-fg-muted">
          Turn on See-through panels first.
        </p>
      ) : null}
    </div>
  );
}

export const sliderSection: PartSection = {
  id: "slider",
  number: "18.6",
  name: "Slider",
  order: "kit 18.6 · T1-F45",
  notApplicable: "read-only, busy, loading",
  rows: [
    { name: "Default", copies: () => <Opacity /> },
    {
      name: "Ends of the range",
      copies: () => (
        <div className="flex flex-col gap-2">
          <Opacity value={10} />
          <Opacity value={100} />
        </div>
      ),
    },
    { name: "Hover", force: "hover", target: "input", copies: () => <Opacity /> },
    { name: "Focus", force: "focus", target: "input", copies: () => <Opacity /> },
    { name: "Unavailable", copies: () => <Opacity unavailable /> },
    {
      name: "Error, inside a dialog",
      copies: () => <Opacity error="Couldn't save the opacity. It is back at 40%." />,
    },
  ],
};
