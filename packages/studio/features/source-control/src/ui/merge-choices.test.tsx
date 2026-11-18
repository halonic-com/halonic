// @vitest-environment jsdom
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { UpdateItem, UpdateMerge } from "../api.ts";
import { ChangesList } from "../changes-list.ts";
import { fakeSource, settle } from "../source.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ChangesView } from "./changes-page.tsx";

afterEach(unmountAll);

const item = (path: string, mine: string | null, theirs: string | null): UpdateItem => ({
  path,
  mine,
  theirs,
  choice: undefined,
  copy: undefined,
});

const merge = (items: readonly UpdateItem[], people = ["Sam"]): UpdateMerge => ({
  items,
  versions: 2,
  people,
});

async function openPage(options: { started?: UpdateMerge; left?: UpdateMerge } = {}) {
  const fake = fakeSource({
    kind: "ready",
    changes: [{ path: "x.md", status: "modified", staged: false }],
  });
  fake.setTexts("x.md", { before: "a\n", after: "b\n" });
  fake.setRemote(true);
  if (options.started !== undefined) {
    fake.setUpdates({ kind: "both-moved" });
    fake.setMergeStart({ kind: "started", merge: options.started });
  }
  if (options.left !== undefined) fake.setMerge(options.left);
  const toasts = createToastStore();
  const list = new ChangesList(fake.source);
  const root = render(
    <ToastStoreProvider store={toasts}>
      <ChangesView list={list} />
    </ToastStoreProvider>,
  );
  await act(settle);
  return { fake, root, toasts, list };
}

/** A button by its label; the busy label a button also holds is ignored. */
const button = (label: string) => {
  const all = [...document.querySelectorAll("button")];
  return (
    all.find((b) => b.textContent?.trim() === label) ??
    all.find((b) => b.textContent?.trim().startsWith(label) && label === "Get updates")
  );
};
const press = (label: string) =>
  act(async () => {
    button(label)?.click();
    await settle();
  });
/** Presses a button the way a key press does: focused first, so focus has somewhere to be lost from. */
const pressFocused = (label: string) =>
  act(async () => {
    button(label)?.focus();
    button(label)?.click();
    await settle();
  });
const focusedHeading = () => document.activeElement === document.querySelector("h1");
const unavailable = (label: string) => button(label)?.getAttribute("aria-disabled") === "true";

verifies("source-control.get-updates-per-item", () => {
  describe("Get updates, choosing item by item", () => {
    it("opens the choices when both sides have new versions, with neither chosen", async () => {
      const { root } = await openPage({
        started: merge([item("a.md", "mine\n", "sam\n"), item("b.md", "m\n", null)]),
      });
      await press("Get updates");
      expect(root.textContent).toContain(
        "You and Sam both changed 2 items. Choose which one to keep. Your version is kept in History either way.",
      );
      expect(button("Keep mine")).toBeDefined();
      expect(button("Use Sam's")).toBeDefined();
      expect(document.querySelector("[aria-pressed=true]")).toBeNull();
    });

    it("says the shared one when more than one person's versions came", async () => {
      await openPage({ started: merge([item("a.md", "m\n", "s\n")], ["Sam", "Ada"]) });
      await press("Get updates");
      expect(button("Use the shared one")).toBeDefined();
      expect(document.body.textContent).toContain("You and the team both changed 1 item.");
    });

    it("says there's nothing to choose when no item changed on both sides", async () => {
      await openPage({ started: merge([]) });
      await press("Get updates");
      expect(document.body.textContent).toContain(
        "You and Sam changed different items, so there's nothing to choose. Finish getting updates to bring theirs in.",
      );
      expect(document.body.textContent).not.toContain("Choose which one to keep");
      expect(unavailable("Finish getting updates")).toBe(false);
    });

    it("says the team changed different items when more than one person's versions came", async () => {
      await openPage({ started: merge([], ["Sam", "Ada"]) });
      await press("Get updates");
      expect(document.body.textContent).toContain(
        "You and the team changed different items, so there's nothing to choose.",
      );
    });

    it("offers Keep both only where both sides still have the item", async () => {
      await openPage({
        started: merge([item("a.md", "mine\n", "sam\n"), item("b.md", "mine\n", null)]),
      });
      await press("Get updates");
      expect(
        [...document.querySelectorAll("button")].filter((b) => b.textContent === "Keep both"),
      ).toHaveLength(1);
    });

    it("shows the choice with Undo, folds the other side, and Undo brings both back", async () => {
      const { fake } = await openPage({ started: merge([item("a.md", "mine\n", "sam\n")]) });
      await press("Get updates");
      await press("Keep mine");
      expect(fake.mergeCalls).toContain("choose a.md mine Sam's");
      expect(document.body.textContent).toContain("Keeping yours");
      expect(document.body.textContent).toContain("Sam's: not used");
      expect(document.activeElement?.textContent).toContain("Keeping yours");
      await press("Undo");
      expect(fake.mergeCalls).toContain("undo a.md");
      expect(button("Keep mine")).toBeDefined();
      expect(document.activeElement).toBe(button("Keep mine"));
    });

    it('folds both sides without "not used" after Keep both, and names the copy with Sam\'s', async () => {
      const { fake } = await openPage({ started: merge([item("a.md", "mine\n", "sam\n")]) });
      await press("Get updates");
      await press("Keep both");
      expect(fake.mergeCalls).toContain("choose a.md both Sam's");
      expect(document.body.textContent).toContain("Keeping both");
      expect(document.body.textContent).not.toContain("not used");
    });

    it("keeps Finish unavailable until every item is chosen, and says how many are left", async () => {
      const { fake, toasts } = await openPage({
        started: merge([item("a.md", "m\n", "s\n"), item("b.md", "m\n", null)]),
      });
      await press("Get updates");
      expect(unavailable("Finish getting updates")).toBe(true);
      expect(document.body.textContent).toContain("Choose for 2 more items.");
      await act(async () => {
        document.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
          if (b.textContent === "Keep mine") b.click();
        });
        await settle();
      });
      expect(document.body.textContent).toContain("Choose for 1 more item.");
      await press("Keep mine");
      expect(unavailable("Finish getting updates")).toBe(false);
      await pressFocused("Finish getting updates");
      expect(fake.mergeCalls.at(-1)).toBe("finish Merged Sam's updates");
      expect(toasts.list().map((t) => t.title)).toContain("Merged Sam's updates");
      expect(button("Finish getting updates")).toBeUndefined();
      expect(focusedHeading()).toBe(true);
    });

    it("cancels, leaving everything as it was", async () => {
      const { fake, toasts } = await openPage({ started: merge([item("a.md", "m\n", "s\n")]) });
      await press("Get updates");
      await pressFocused("Cancel getting updates");
      expect(fake.mergeCalls.at(-1)).toBe("cancel");
      expect(toasts.list().map((t) => t.title)).toContain("Cancelled getting updates");
      expect(button("Cancel getting updates")).toBeUndefined();
      expect(focusedHeading()).toBe(true);
    });

    it("leaves focus where it is when a read finds the merge ended elsewhere", async () => {
      const { fake, list } = await openPage({ started: merge([item("a.md", "m\n", "s\n")]) });
      await press("Get updates");
      button("Get updates")?.focus();
      fake.setMerge(null);
      await act(async () => {
        await list.refresh();
        await settle();
      });
      expect(button("Cancel getting updates")).toBeUndefined();
      expect(document.activeElement).toBe(button("Get updates"));
    });

    it("says why a choice didn't work and keeps the item open", async () => {
      const { fake } = await openPage({ started: merge([item("a.md", "m\n", "s\n")]) });
      await press("Get updates");
      fake.failMerge(new Error("boom"));
      await press("Keep mine");
      expect(document.querySelector("[role=alert]")?.textContent).toContain(
        "Couldn't make that choice",
      );
      expect(button("Keep mine")).toBeDefined();
    });

    it("says why Get updates couldn't start, with nothing changed", async () => {
      const { fake, toasts } = await openPage({ started: merge([item("a.md", "m\n", "s\n")]) });
      fake.failMerge(new Error("boom"));
      await press("Get updates");
      expect(toasts.list()[0]?.title).toBe("Couldn't get versions");
      expect(toasts.list()[0]?.text).toContain("Nothing changed here.");
    });

    it("says the old thing when the two sides no longer both have new versions", async () => {
      const { fake, toasts } = await openPage();
      fake.setUpdates({ kind: "both-moved" });
      await press("Get updates");
      expect(toasts.list()[0]?.text).toContain("Something changed while getting updates.");
    });

    it("tells a merge left half done from one just started, and Continue brings the choices back", async () => {
      const left = merge([
        { ...item("a.md", "m\n", "s\n"), choice: "theirs" },
        item("b.md", "m\n", "s\n"),
      ]);
      const { root } = await openPage({ left });
      expect(root.textContent).toContain("You're in the middle of getting Sam's updates.");
      expect(button("Keep mine")).toBeUndefined();
      await press("Continue");
      expect(root.textContent).toContain("Keeping Sam's");
      expect(root.textContent).toContain("Choose for 1 more item.");
    });

    it("makes what waits unavailable, with the reason, while the merge is started", async () => {
      const { root } = await openPage({ left: merge([item("a.md", "m\n", "s\n")]) });
      expect(unavailable("Create version")).toBe(true);
      expect(unavailable("Get updates")).toBe(true);
      const row = root.querySelector<HTMLElement>('td[role="gridcell"]');
      await act(async () => {
        row?.focus();
        row?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      expect(unavailable("Undo these changes")).toBe(true);
      expect(document.body.textContent).toContain("Finish getting updates first.");
    });
  });
});
