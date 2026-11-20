// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeAll, expect, it } from "vitest";
import { choose, field, typeAndLeave, unmount } from "../test-support.tsx";
import { arrowsSection, menuPick, pick, showPage } from "./step-arrows.test-helper.tsx";

// jsdom has no popover: a menu closes itself after a pick by hiding it.
beforeAll(() => {
  HTMLElement.prototype.hidePopover ??= () => {};
});
afterEach(unmount);

/** The button of the arrow row `number` (from 1), which expands it. */
function rowButton(page: HTMLElement, number: number) {
  const rows = arrowsSection(page).section?.querySelectorAll("li");
  return rows?.[number - 1]?.querySelector<HTMLButtonElement>("button[aria-expanded]") ?? null;
}

async function expand(page: HTMLElement, number: number) {
  await act(async () => rowButton(page, number)?.click());
}

/** The labels of the expanded row's fields, in order. */
function fieldLabels(page: HTMLElement): string[] {
  const group = arrowsSection(page).section?.querySelector("li > div[id]");
  return [...(group?.querySelectorAll("label") ?? [])].map(
    (label) => label.textContent?.trim() ?? "",
  );
}

const anyRef = expect.objectContaining({ id: "reply" });

verifies("workflows.page.arrow-fields", () => {
  it("expands a pressed row to To, On event, Condition (JSON) and Label, one row at a time", async () => {
    const { page } = await showPage();
    await pick(page, "sort");

    await expand(page, 1);
    const button = rowButton(page, 1);
    expect(button?.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(button?.getAttribute("aria-controls") ?? "")).not.toBeNull();
    expect(fieldLabels(page)).toEqual(["To", "On event", "Condition (JSON)", "Label"]);
    expect((field(page, "To") as HTMLSelectElement).value).toBe("approve");
    expect(field(page, "Condition (JSON)")?.value).toBe(
      '{"equals":["{{context.category}}","refund"]}',
    );
    expect(field(page, "On event")?.getAttribute("placeholder")).toBe("done");

    await expand(page, 2);
    expect(rowButton(page, 1)?.getAttribute("aria-expanded")).toBe("false");
    expect(rowButton(page, 2)?.getAttribute("aria-expanded")).toBe("true");

    await expand(page, 2);
    expect(fieldLabels(page)).toEqual([]);
  });

  it("saves a pick of To at once, and the event and label when they're left", async () => {
    const { page, changeArrows } = await showPage();
    await pick(page, "sort");
    await expand(page, 2);

    await choose(field(page, "To") as HTMLSelectElement, "done");
    await typeAndLeave(field(page, "On event") as HTMLInputElement, "skipped");
    await typeAndLeave(field(page, "Label") as HTMLInputElement, "Nothing to reply");

    expect(changeArrows.mock.calls.map((call) => call.slice(1))).toEqual([
      ["sort", { kind: "set", index: 1, field: "to", value: "done" }],
      ["sort", { kind: "set", index: 1, field: "event", value: "skipped" }],
      ["sort", { kind: "set", index: 1, field: "label", value: "Nothing to reply" }],
    ]);
    expect(arrowsSection(page).rows[1]).toBe("2 → done on skipped");
    expect(changeArrows).toHaveBeenCalledWith(anyRef, "sort", expect.anything());
  });

  it("says a condition isn't JSON when it's left, keeps the saved one, and empty takes it out", async () => {
    const { page, changeArrows } = await showPage();
    await pick(page, "sort");
    await expand(page, 1);
    const condition = field(page, "Condition (JSON)") as HTMLTextAreaElement;

    await typeAndLeave(condition, "{ category: refund");
    expect(page.textContent).toContain("This isn't valid JSON.");
    expect(condition.getAttribute("aria-invalid")).toBe("true");
    expect(changeArrows).not.toHaveBeenCalled();
    expect(arrowsSection(page).rows[0]).toBe("1 → approve on done if category = refund");

    await typeAndLeave(condition, '{ "exists": "context.summary" }');
    expect(page.textContent).not.toContain("This isn't valid JSON.");
    expect(changeArrows).toHaveBeenLastCalledWith(anyRef, "sort", {
      kind: "set",
      index: 0,
      field: "condition",
      value: { exists: "context.summary" },
    });

    await typeAndLeave(condition, "");
    expect(changeArrows).toHaveBeenLastCalledWith(anyRef, "sort", {
      kind: "set",
      index: 0,
      field: "condition",
      value: undefined,
    });
    expect(arrowsSection(page).rows[0]).toBe("1 → approve on done");
  });

  it("offers a wait step's arrow a timer in place of its event, with After's hint", async () => {
    const { page, changeArrows } = await showPage();
    await pick(page, "approve");
    await expand(page, 1);

    const useTimer = [...page.querySelectorAll("aside label")].find((label) =>
      label.textContent?.includes("Use a timer instead (fires if nothing happens in time)"),
    );
    const box =
      useTimer?.querySelector("input") ??
      document.getElementById(useTimer?.getAttribute("for") ?? "");
    await act(async () => box?.click());
    expect(fieldLabels(page)).toContain("After");
    expect(fieldLabels(page)).not.toContain("On event");
    expect(page.textContent).toContain("30m, 4h, 2d");
    expect(changeArrows).not.toHaveBeenCalled();

    await typeAndLeave(field(page, "After") as HTMLInputElement, "4h");
    expect(changeArrows).toHaveBeenLastCalledWith(anyRef, "approve", {
      kind: "set",
      index: 0,
      field: "after",
      value: "4h",
    });
    expect(arrowsSection(page).rows[0]).toBe("1 → write after 4h");

    await act(async () => box?.click());
    expect(changeArrows).toHaveBeenLastCalledWith(anyRef, "approve", {
      kind: "set",
      index: 0,
      field: "after",
      value: undefined,
    });
    expect(fieldLabels(page)).toContain("On event");
  });

  it("offers no timer on a step that isn't a wait", async () => {
    const { page } = await showPage();
    await pick(page, "sort");
    await expand(page, 1);
    expect(page.textContent).not.toContain("Use a timer instead");
  });

  it("keeps a moved arrow's row expanded in its new place", async () => {
    const { page } = await showPage();
    await pick(page, "sort");
    await expand(page, 2);

    await menuPick(page, "More actions for arrow 2", "Move up");

    expect(rowButton(page, 1)?.getAttribute("aria-expanded")).toBe("true");
    expect((field(page, "To") as HTMLSelectElement).value).toBe("write");
  });
});
