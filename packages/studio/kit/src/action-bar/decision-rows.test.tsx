// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { ActionBar, type ActionBarRow } from "./action-bar.tsx";
import { type DecisionEvent, decisionRows } from "./decision-rows.ts";

afterEach(() => {
  unmountAll();
});

const approve: DecisionEvent = { label: "Approve", busyLabel: "Approving…", onClick: vi.fn() };
const remember: DecisionEvent = { label: "Approve and remember" };
const ask: DecisionEvent = { label: "Ask for changes" };
const reject: DecisionEvent = { label: "Reject", busyLabel: "Rejecting…" };

/** Each row as its labels and variants: "Approve:primary". */
const shape = (rows: readonly ActionBarRow[]) =>
  rows.map((row) => row.map((button) => `${button.label}:${button.variant}`));

verifies("kit.decision-rows", () => {
  it("puts one event on its own row, primary", () => {
    expect(shape(decisionRows([approve]))).toEqual([["Approve:primary"]]);
  });

  it("puts a second event on its own row, secondary", () => {
    expect(shape(decisionRows([approve, reject]))).toEqual([
      ["Approve:primary"],
      ["Reject:secondary"],
    ]);
  });

  it("puts two other events side by side", () => {
    expect(shape(decisionRows([approve, ask, reject]))).toEqual([
      ["Approve:primary"],
      ["Ask for changes:secondary", "Reject:secondary"],
    ]);
  });

  it("stacks three or more other events, in file order", () => {
    expect(shape(decisionRows([approve, remember, ask, reject]))).toEqual([
      ["Approve:primary"],
      ["Approve and remember:secondary"],
      ["Ask for changes:secondary"],
      ["Reject:secondary"],
    ]);
  });

  it("follows the file's order, not the words: the first event is the primary one", () => {
    expect(shape(decisionRows([reject, approve]))).toEqual([
      ["Reject:primary"],
      ["Approve:secondary"],
    ]);
  });

  it("gives no rows without events", () => {
    expect(decisionRows([])).toEqual([]);
  });

  it("keeps each event's label, busy label and handler", () => {
    const [[first]] = decisionRows([approve]) as [[DecisionEvent]];
    expect(first.busyLabel).toBe("Approving…");
    expect(first.onClick).toBe(approve.onClick);
  });

  it("draws nothing red, and while one decides the others are unavailable", () => {
    const { container } = render(
      <ActionBar rows={decisionRows([{ ...approve, busy: true }, ask, reject])} />,
    );
    const [busy, ...others] = [...container.querySelectorAll("button")];
    expect(busy?.getAttribute("aria-busy")).toBe("true");
    expect(busy?.textContent).toContain("Approving…");
    for (const button of others) {
      expect(button.getAttribute("aria-disabled")).toBe("true");
      expect(button.className).not.toContain("bg-danger");
    }
  });
});
