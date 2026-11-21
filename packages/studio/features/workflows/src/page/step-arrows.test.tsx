// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { buttonNamed, unmount } from "../test-support.tsx";
import {
  arrowsSection,
  goTo,
  menuPick,
  openMenu,
  pick,
  reply,
  showPage,
} from "./step-arrows.test-helper.tsx";

// jsdom has no popover: a menu closes itself after a pick by hiding it.
beforeAll(() => {
  HTMLElement.prototype.hidePopover ??= () => {};
});
afterEach(unmount);

verifies("workflows.page.step-arrows", () => {
  it("numbers the step's arrows in file order, with their event, timer and condition", async () => {
    const { page } = await showPage(vi.fn);

    await pick(page, "sort");
    expect(arrowsSection(page).rows).toEqual([
      "1 → approve on done if category = refund",
      "2 → write on done",
    ]);

    await pick(page, "approve");
    expect(arrowsSection(page).rows).toEqual(["1 → write on approved", "2 → done after 2d"]);
  });

  // jsdom lays nothing out, so this checks the classes that keep a wrapped row's number and ⋮
  // beside its first line (C547 A5) instead of centred on the whole row.
  it("keeps a row's number and ⋮ on its first line when its words wrap", async () => {
    const { page } = await showPage(vi.fn);
    await pick(page, "sort");

    const row = arrowsSection(page).section?.querySelector("li > div");
    const number = row?.firstElementChild;
    const classes = (element: Element | null | undefined) => element?.className.split(" ") ?? [];
    expect(classes(row)).toContain("items-start");
    expect(classes(row)).not.toContain("items-center");
    expect(number?.textContent).toBe("1");
    expect(classes(number)).toEqual(expect.arrayContaining(["h-control-sm", "items-center"]));
  });

  it("has no arrows section on an end step", async () => {
    const { page } = await showPage(vi.fn);
    await pick(page, "done");
    expect(arrowsSection(page).section).toBeUndefined();
  });

  it("moves an arrow from its ⋮, keeping focus on its row, and says where it is now", async () => {
    const { page, changeArrows, announce } = await showPage(vi.fn);
    await pick(page, "sort");

    await menuPick(page, "More actions for arrow 2", "Move up");

    expect(changeArrows).toHaveBeenCalledWith(expect.objectContaining({ id: "reply" }), "sort", {
      kind: "move",
      index: 1,
      by: -1,
      to: "write",
    });
    expect(arrowsSection(page).rows[0]).toBe("1 → write on done");
    expect(announce).toHaveBeenCalledWith("Arrow 2 is now first.");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("More actions for arrow 1");
  });

  it("offers Move up only below the first arrow and Move down only above the last", async () => {
    const { page } = await showPage(vi.fn);
    await pick(page, "sort");

    const entries = openMenu(page, "More actions for arrow 1").map((one) => [
      one.textContent,
      one.getAttribute("aria-disabled") === "true",
    ]);
    expect(entries).toEqual([
      ["Move up", true],
      ["Move down", false],
    ]);
    const last = openMenu(page, "More actions for arrow 2").map((one) => [
      one.textContent,
      one.getAttribute("aria-disabled") === "true",
    ]);
    expect(last).toEqual([
      ["Move up", false],
      ["Move down", true],
    ]);
  });

  it("moves once when Move up is picked again before the first move is written", async () => {
    const { page, changeArrows, release } = await showPage(vi.fn, { held: true });
    await pick(page, "sort");

    await menuPick(page, "More actions for arrow 2", "Move up");
    await menuPick(page, "More actions for arrow 2", "Move up");
    await act(async () => release());

    expect(changeArrows).toHaveBeenCalledOnce();
    expect(arrowsSection(page).rows).toEqual([
      "1 → write on done",
      "2 → approve on done if category = refund",
    ]);
  });

  it("has no arrows section where the host can't change arrows", async () => {
    const { page } = await showPage(vi.fn, { canChangeArrows: false });
    await pick(page, "sort");
    expect(arrowsSection(page).section).toBeUndefined();
  });

  it("adds an arrow on done to the step picked in Go to…, and says so", async () => {
    const { page, changeArrows, announce } = await showPage(vi.fn);
    await pick(page, "sort");

    const picker = await goTo(page, "done");
    await act(async () => buttonNamed(page, "Add")?.click());

    expect(changeArrows).toHaveBeenCalledWith(expect.anything(), "sort", {
      kind: "add",
      to: "done",
    });
    expect(arrowsSection(page).rows[2]).toBe("3 → done on done");
    expect(announce).toHaveBeenCalledWith("Arrow added: sort to done.");
    expect(picker?.value).toBe("");
  });

  it("puts focus on Go to… when Add is pressed with no step picked, and adds nothing", async () => {
    const { page, changeArrows } = await showPage(vi.fn);
    await pick(page, "sort");

    await act(async () => buttonNamed(page, "Add")?.click());

    expect(changeArrows).not.toHaveBeenCalled();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Go to…");
  });

  it("says why on a toast when the arrows can't change, and announces nothing", async () => {
    const { page, announce, toasts } = await showPage(vi.fn, { fail: true });
    await pick(page, "sort");

    await goTo(page, "done");
    await act(async () => buttonNamed(page, "Add")?.click());

    expect(toasts.list()).toEqual([
      expect.objectContaining({ title: "Couldn't change step sort", tone: "danger" }),
    ]);
    expect(announce).not.toHaveBeenCalled();
    expect(arrowsSection(page).rows).toHaveLength(2);
  });

  it("lists the steps with arrows in, each opening its step's card", async () => {
    const { page } = await showPage(vi.fn);
    await pick(page, "write");

    const from = [...page.querySelectorAll<HTMLButtonElement>("aside section button")].filter(
      (button) => button.textContent?.startsWith("From "),
    );
    expect(from.map((button) => button.textContent)).toEqual(["From sort", "From approve"]);

    await act(async () => from[1]?.click());
    expect(page.querySelector("aside h2")?.textContent).toBe("Step approve");
    // The new card's title takes the focus the button had, so a screen reader hears where it is.
    expect(document.activeElement).toBe(page.querySelector("aside h2"));
  });

  it("lists a step with two arrows in once, and not the step's own arrow to itself", async () => {
    const { page } = await showPage(vi.fn, {
      workflow: {
        ...reply,
        arrows: [
          ...reply.arrows,
          { from: "sort", to: "write", event: "retry" },
          { from: "write", to: "write", event: "again" },
        ],
      },
    });
    await pick(page, "write");

    const from = [...page.querySelectorAll<HTMLButtonElement>("aside section button")]
      .map((button) => button.textContent ?? "")
      .filter((text) => text.startsWith("From "));
    expect(from).toEqual(["From sort", "From approve"]);
  });
});
