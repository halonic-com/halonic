import { useId } from "react";
import { FilterChips } from "../../src/filter-chips/filter-chips.tsx";
import type { PartSection } from "../state-table.tsx";

const hubs = [
  { value: "all", label: "All" },
  { value: "acme", label: "acme" },
  { value: "beta", label: "beta" },
];

const places = [
  { value: "agents", label: "Agents" },
  { value: "routines", label: "Routines and their schedules" },
];

function Chips() {
  return (
    <>
      <FilterChips label="Hub" options={hubs} value="acme" onChange={() => undefined} />
      <FilterChips
        label="Filters"
        pickers={[
          {
            label: "Hub",
            all: "All hubs",
            options: hubs.slice(1),
            value: undefined,
            onChange: () => undefined,
          },
          {
            label: "In",
            all: "Everything",
            options: places,
            value: "routines",
            onChange: () => undefined,
          },
        ]}
        toggles={[{ label: "Test runs", pressed: false, onChange: () => undefined }]}
      />
    </>
  );
}

function UnavailableChips() {
  const reason = useId();
  return (
    <>
      <FilterChips
        label="Filters"
        toggles={[
          {
            label: "Test runs",
            pressed: false,
            onChange: () => undefined,
            unavailable: { reason },
          },
          { label: "Failed", pressed: true, onChange: () => undefined, unavailable: { reason } },
        ]}
      />
      <span id={reason} className="self-center text-small text-fg-muted">
        No runs yet.
      </span>
    </>
  );
}

export const filterChipsSection: PartSection = {
  id: "filter-chips",
  number: "15.7",
  name: "FilterChips",
  order:
    "kit 15.7 · left to right: a one-of row with acme on; then a picker with nothing picked, a picker with a long value picked (an ellipsis at 160px), an off toggle",
  notApplicable: "error (a filter can't be wrong)",
  rows: [
    { name: "Default", copies: () => <Chips /> },
    { name: "Hover", force: "hover", target: "input, button", copies: () => <Chips /> },
    { name: "Focus", force: "focus", target: "input, button", copies: () => <Chips /> },
    { name: "Unavailable", copies: () => <UnavailableChips /> },
  ],
};
