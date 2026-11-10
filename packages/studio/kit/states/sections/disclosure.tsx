import type { ReactNode } from "react";
import { Disclosure } from "../../src/disclosure/disclosure.tsx";
import { lineClasses } from "../../src/list/list-lines.ts";
import type { PartSection } from "../state-table.tsx";

const budget =
  "Budgets reset on the first of each month. Halonic stops a run before it passes the limit.";

/** The rows sit on the surface of a list, the width of a narrow column. */
function Column({ children }: { readonly children: ReactNode }) {
  return <div className="w-full max-w-90 bg-surface">{children}</div>;
}

/**
 * Disclosures as rows of a flush List: the List's line above every row but the first, from 16px.
 * The Disclosure draws no line of its own.
 */
function FlushList() {
  const rows = [
    { summary: "How the budget works", text: budget },
    { summary: "What a run may change", text: "Only the files in its workspace." },
  ];
  return (
    <Column>
      {rows.map((row, index) => (
        <div key={row.summary} className={index === 0 ? "" : lineClasses.flush.main}>
          <Disclosure summary={row.summary}>{row.text}</Disclosure>
        </div>
      ))}
    </Column>
  );
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
    { name: "In a flush List", copies: () => <FlushList /> },
    {
      // A 640px window at 200% zoom lays out 320px: a long summary wraps, the chevron stays.
      name: "320px, as at 200% zoom",
      copies: () => (
        <div className="w-80 bg-surface">
          <Disclosure summary="How the budget works when a run goes over its monthly limit">
            {budget}
          </Disclosure>
          <Disclosure label="What's in it" summary="3 items" tone="value">
            Sorter, Inbox sort and Weekly summary.
          </Disclosure>
        </div>
      ),
    },
  ],
};
