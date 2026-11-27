import { SearchField } from "../../src/search-field/search-field.tsx";
import type { PartSection } from "../state-table.tsx";

/** The list panel's search, as wide as a 380px list less its 20px sides. */
function SampleSearch({ disabled = false }: { readonly disabled?: boolean }) {
  return (
    <div className="w-85 phone:w-full">
      <SearchField label="Search chats" disabled={disabled} />
    </div>
  );
}

export const searchFieldSection: PartSection = {
  id: "search-field",
  number: "3.4",
  name: "SearchField",
  order: "kit 3.4 · one search field, empty",
  notApplicable: "error, read-only (a search has neither)",
  rows: [
    { name: "Default", copies: () => <SampleSearch /> },
    { name: "Hover", force: "hover", copies: () => <SampleSearch /> },
    { name: "Focus", force: "focus", target: "input", copies: () => <SampleSearch /> },
    { name: "Disabled", copies: () => <SampleSearch disabled /> },
  ],
};
