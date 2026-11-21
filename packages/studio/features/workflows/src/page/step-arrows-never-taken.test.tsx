// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { WorkflowView } from "../api.ts";
import { buttonNamed, unmount } from "../test-support.tsx";
import { neverTaken } from "./never-taken.ts";
import { arrowsSection, goTo, menuPick, pick, showPage } from "./step-arrows.test-helper.tsx";
import { stepNames } from "./step-names.ts";

// jsdom has no popover: a menu closes itself after a pick by hiding it.
beforeAll(() => {
  HTMLElement.prototype.hidePopover ??= () => {};
});
afterEach(unmount);

const spam = { equals: ["{{context.kind}}", "spam"] };

/** C548's walk: `classify` ends spam at `ignored`, and sends everything else on to `draft`. */
const triage: WorkflowView = {
  hubId: "acme",
  id: "reply",
  name: "Support reply",
  initial: "classify",
  steps: [
    { id: "classify", type: "task", title: "Classify it" },
    { id: "draft", type: "task", title: "Draft a reply" },
    { id: "review", type: "wait", title: "Check the draft" },
    { id: "ignored", type: "final", title: "Finished without a reply" },
    { id: "sent", type: "final" },
  ],
  arrows: [
    { from: "classify", to: "ignored", condition: spam },
    { from: "classify", to: "draft" },
    { from: "draft", to: "review" },
    { from: "review", to: "sent", event: "approved" },
    { from: "review", to: "draft", event: "rejected" },
    { from: "review", to: "sent", after: "2d" },
  ],
  layout: {},
};

/** The text of the line under each row that says the arrow is never taken; "" for none. */
function neverTakenLines(page: HTMLElement): string[] {
  const rows = arrowsSection(page).section?.querySelectorAll("li") ?? [];
  return [...rows].map(
    (row) => row.querySelector(":scope > div > span:nth-child(2) > span")?.textContent ?? "",
  );
}

verifies("workflows.page.step-arrows", () => {
  it("names steps as the canvas does, in the rows and Arrows in", async () => {
    const { page } = await showPage(vi.fn, { workflow: triage });

    await pick(page, "Classify it");
    expect(arrowsSection(page).rows).toEqual([
      "1 → Finished without a reply on done if kind = spam",
      "2 → Draft a reply on done",
    ]);

    await pick(page, "Draft a reply");
    expect(buttonNamed(page, "From Classify it")).toBeDefined();
    expect(buttonNamed(page, "From Check the draft")).toBeDefined();
  });

  it("offers Go to… the other steps by their names, not the step itself", async () => {
    const { page } = await showPage(vi.fn, { workflow: triage });
    await pick(page, "Classify it");

    const picker = page.querySelector<HTMLSelectElement>('aside select[aria-label="Go to…"]');
    const offered = [...(picker?.options ?? [])]
      .filter((option) => option.value !== "")
      .map((option) => [option.value, option.textContent]);
    expect(offered).toEqual([
      ["draft", "Draft a reply"],
      ["review", "Check the draft"],
      ["ignored", "Finished without a reply"],
      ["sent", "sent"],
    ]);
  });

  it("says on its row when a move leaves an arrow never taken, and announces it", async () => {
    const { page, announce } = await showPage(vi.fn, { workflow: triage });
    await pick(page, "Classify it");
    expect(neverTakenLines(page)).toEqual(["", ""]);

    await menuPick(page, "More actions for arrow 1", "Move down");

    expect(neverTakenLines(page)).toEqual(["", "△ Never taken: arrow 1 always matches first"]);
    expect(announce).toHaveBeenCalledWith(
      "Arrow 1 is now second. Arrow 2 is never taken: arrow 1 always matches first.",
    );
  });

  it("opens a new arrow's fields when an earlier arrow always beats it, and says so", async () => {
    const { page, announce } = await showPage(vi.fn, { workflow: triage });
    await pick(page, "Classify it");

    await goTo(page, "review");
    await act(async () => buttonNamed(page, "Add")?.click());

    expect(neverTakenLines(page)[2]).toBe("△ Never taken: arrow 2 always matches first");
    const newRow = arrowsSection(page).section?.querySelectorAll("li")[2];
    expect(newRow?.querySelector("button[aria-expanded]")?.getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(announce).toHaveBeenCalledWith(
      "Arrow added: Classify it to Check the draft. Arrow 3 is never taken: arrow 2 always matches first.",
    );
  });

  it("marks no arrow on other events or with a timer", async () => {
    const { page } = await showPage(vi.fn, { workflow: triage });
    await pick(page, "Check the draft");
    expect(neverTakenLines(page)).toEqual(["", "", ""]);
  });
});

verifies("workflows.page.step-card", () => {
  it("opens a step from Arrows in on a card titled as the canvas titles it", async () => {
    const { page } = await showPage(vi.fn, { workflow: triage });
    await pick(page, "Draft a reply");
    await act(async () => buttonNamed(page, "From Classify it")?.click());
    expect(page.querySelector("aside h2")?.textContent).toBe("Classify it");
    // A step without a title of its own is titled with its id, as its card on the canvas is.
    await pick(page, "sent");
    expect(page.querySelector("aside h2")?.textContent).toBe("sent");
  });
});

describe("neverTaken", () => {
  it("gives the place of the first arrow without a condition on the same event", () => {
    expect(
      neverTaken([
        { from: "a", to: "b", condition: spam },
        { from: "a", to: "c" },
        { from: "a", to: "d", condition: spam },
        { from: "a", to: "e" },
        { from: "a", to: "f", event: "approved" },
        { from: "a", to: "g", after: "1h" },
      ]),
    ).toEqual([undefined, undefined, 2, 2, undefined, undefined]);
  });
});

describe("stepNames", () => {
  it("names a step by its title, its id without one, and both when a title is shared", () => {
    const names = stepNames([
      { id: "draft", title: "Reply" },
      { id: "redraft", title: "Reply" },
      { id: "classify", title: "Classify it" },
      { id: "done" },
    ]);
    expect([...names.values()]).toEqual([
      "Reply (draft)",
      "Reply (redraft)",
      "Classify it",
      "done",
    ]);
  });
});
