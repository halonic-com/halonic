import type { ReactNode } from "react";
import { Disclosure } from "../../src/disclosure/disclosure.tsx";
import type { PartSection } from "../state-table.tsx";

const budget =
  "Budgets reset on the first of each month. Halonic stops a run before it passes the limit.";

/** The rows sit on the surface of a list, the width of a narrow column. */
function Column({ children }: { readonly children: ReactNode }) {
  return <div className="w-full max-w-90 bg-surface">{children}</div>;
}

export const disclosureSection: PartSection = {
  id: "disclosure",
  number: "18.1",
  name: "Disclosure",
  order: "kit 18.1 · one row, or a value under its label",
  notApplicable: "disabled, error (a row that opens text has neither)",
  rows: [
    {
      name: "Closed",
      copies: () => (
        <Column>
          <Disclosure summary="How the budget works">{budget}</Disclosure>
        </Column>
      ),
    },
    {
      name: "Open",
      copies: () => (
        <Column>
          <Disclosure summary="How the budget works" defaultOpen>
            {budget}
          </Disclosure>
        </Column>
      ),
    },
    {
      name: "Hover",
      force: "hover",
      target: "summary",
      copies: () => (
        <Column>
          <Disclosure summary="How the budget works">{budget}</Disclosure>
        </Column>
      ),
    },
    {
      name: "Focus",
      force: "focus",
      target: "summary",
      copies: () => (
        <Column>
          <Disclosure summary="How the budget works">{budget}</Disclosure>
        </Column>
      ),
    },
    {
      name: "With a label",
      copies: () => (
        <Column>
          <Disclosure label="What's in it" summary="3 items" tone="value">
            Sorter, Inbox sort and Weekly summary.
          </Disclosure>
        </Column>
      ),
    },
  ],
};
