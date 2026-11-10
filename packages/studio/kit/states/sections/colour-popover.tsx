import { useRef } from "react";
import { ColourPopover, type ColourPreset } from "../../src/colour-popover/colour-popover.tsx";
import type { PartSection } from "../state-table.tsx";

const ignore = () => undefined;

/** The eight presets Noah drew (T1-F47). Colours here are data, the way the feature passes them. */
const PRESETS: readonly ColourPreset[] = [
  { value: "#3B8BFF", name: "Blue" },
  { value: "#8B5CF6", name: "Violet" },
  { value: "#0B7052", name: "Green" },
  { value: "#A84B05", name: "Amber" },
  { value: "#C4143D", name: "Red" },
  { value: "#10102E", name: "Ink" },
  { value: "#E0559A", name: "Pink" },
  { value: "#0E9AA7", name: "Teal" },
];

/**
 * The popover's content as it shows when open. On the page it's drawn in place, so every row
 * shows at once; `popover` is the only thing the page leaves out.
 */
function Open({ value = "#3B8BFF" }: { readonly value?: string }) {
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <div data-in-place="">
      <ColourPopover
        id={`colour-${value}`}
        open={false}
        opener={opener}
        onClose={ignore}
        label="Choose the first colour"
        presets={PRESETS}
        value={value}
        onChange={ignore}
        presetsLabel="Presets"
        hexLabel="Hex colour"
        hexError="Use six digits, like #3B8BFF."
      />
    </div>
  );
}

export const colourPopoverSection: PartSection = {
  id: "colour-popover",
  number: "3, L10",
  name: "Colour popover",
  order: "kit 3 and 23.3 L10 · T1-F47 · the hex error shows after Enter or leaving the field",
  notApplicable: "disabled (its button is), read-only, busy, loading",
  rows: [
    { name: "Default", copies: () => <Open /> },
    { name: "Picked preset", copies: () => <Open value="#8B5CF6" /> },
    {
      name: "Hover",
      force: "hover",
      target: 'label:nth-child(3) > [type="radio"]',
      copies: () => <Open />,
    },
    {
      name: "Focus",
      force: "focus",
      target: 'label:nth-child(2) > [type="radio"]',
      copies: () => <Open />,
    },
    { name: "Hex, a typed value", copies: () => <Open value="#2A7F62" /> },
  ],
};
