// @vitest-environment jsdom
import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Version } from "../api.ts";
import { ChangesList } from "../changes-list.ts";
import { fakeSource, settle } from "../source.test-helper.ts";
import { buttonsNamed } from "../test-support/buttons.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { PhoneStack, topBarBack, topBarTitle } from "../test-support/phone-stack.tsx";
import { render, unmountAll } from "../test-support/render.tsx";
import { ChangesView } from "./changes-page.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const manyVersions = (count: number): Version[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `v${count - i}`,
    name: `Version ${count - i}`,
    notes: "",
    author: "Sam Lee",
    at: Date.now() - 60_000 - i * 1000,
    files: [],
  }));

async function openPhonePage(fake: ReturnType<typeof fakeSource>) {
  const list = new ChangesList(fake.source);
  const root = render(
    <PresentationProvider presentation="phone">
      <PhoneStack>{(pages) => <ChangesView list={list} phonePages={pages} />}</PhoneStack>
    </PresentationProvider>,
  );
  await act(settle);
  return root;
}

function changedModels() {
  const fake = fakeSource({
    kind: "ready",
    changes: [{ path: "models.yaml", status: "modified", staged: false }],
  });
  fake.setTexts("models.yaml", { before: "a: 1\n", after: "a: 2\n" });
  return fake;
}

function createVersionButton(root: HTMLElement): HTMLButtonElement | undefined {
  return [...root.querySelectorAll("button")].find(
    (element) => element.textContent?.trim() === "Create version",
  );
}

function historyRow(root: HTMLElement, name: string): HTMLElement {
  const found = [...root.querySelectorAll<HTMLElement>('[role="gridcell"]')].find((row) =>
    row.textContent?.includes(name),
  );
  if (found === undefined) throw new Error(`no row ${name}`);
  return found;
}

verifies("source-control.changes-phone", () => {
  describe("ChangesView on a phone", () => {
    it("leaves the heading to screen readers and keeps a 16px inset", async () => {
      const root = await openPhonePage(changedModels());
      const heading = root.querySelector("h1");
      expect(heading?.textContent).toBe("Changes");
      expect(heading?.className).toContain("sr-only");
      expect(root.querySelector('[data-part="page"]')?.firstElementChild?.className).toContain(
        "p-4",
      );
    });

    it("draws Create version as a full-width button that opens the form sheet", async () => {
      const root = await openPhonePage(changedModels());
      const create = createVersionButton(root);
      expect(create?.className).toContain("w-full");
      expect(create?.className).toContain("min-h-touch");
      act(() => create?.click());
      expect(document.querySelector("dialog")?.textContent).toContain("Notes");
    });

    it("has no Create version when nothing changed", async () => {
      const root = await openPhonePage(fakeSource({ kind: "ready", changes: [] }));
      expect(root.textContent).toContain("Nothing has changed since your last version.");
      expect(createVersionButton(root)).toBeUndefined();
    });

    it("says git is on the computer when git is missing", async () => {
      const root = await openPhonePage(fakeSource({ kind: "no-git" }));
      expect(root.textContent).toContain("Halonic needs git on your computer to keep versions.");
    });

    it("says Halonic on the computer isn't answering when git doesn't answer", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      fake.failReads(new Error("boom"));
      const root = await openPhonePage(fake);
      expect(root.textContent).toContain("Couldn't load changes");
      expect(root.textContent).toContain("Halonic on your computer isn't answering.");
      expect(root.textContent).toContain("Try again");
    });
    it("says the share address is on the computer, with no way to add one", async () => {
      const root = await openPhonePage(changedModels());
      expect(root.textContent).toContain("Only on your computer.");
      expect(root.textContent).toContain("Add where to share on a computer.");
      const buttons = [...root.querySelectorAll("button")].map((b) => b.textContent?.trim());
      expect(buttons).not.toContain("Add where to share");
    });

    it("ends an item row with its More button in the row's padding, with nothing after it", async () => {
      const root = await openPhonePage(changedModels());
      const more = root.querySelector<HTMLButtonElement>('button[aria-label^="More actions for"]');
      const cell = more?.closest("td");
      expect(cell?.className).toContain("pr-1");
      expect(cell?.nextElementSibling).toBeNull();
    });

    it("draws Get updates as a touch button at the end of the header", async () => {
      const fake = changedModels();
      fake.setRemote(true);
      const root = await openPhonePage(fake);
      const button = [...root.querySelectorAll("button")].find(
        (element) => element.textContent?.startsWith("Get updates") === true,
      );
      expect(button?.className).toContain("min-h-touch");
      expect(button?.closest(".ml-auto")).not.toBeNull();
    });

    it("draws Show more in History as a full-width touch button", async () => {
      const fake = changedModels();
      fake.setHistory(manyVersions(25));
      const root = await openPhonePage(fake);
      act(() => buttonsNamed(root, "See all history")[0]?.click());
      const more = buttonsNamed(root, "Show more")[0];
      expect(more?.className).toContain("w-full");
      expect(more?.className).toContain("min-h-touch");
    });

    it("shows the newest 5 versions and See all history as a full-width touch button", async () => {
      const fake = changedModels();
      fake.setHistory(manyVersions(25));
      const root = await openPhonePage(fake);
      const seeAll = [...root.querySelectorAll("button")].find(
        (element) => element.textContent?.trim() === "See all history",
      );
      expect(seeAll?.className).toContain("w-full");
      expect(seeAll?.className).toContain("min-h-touch");
      expect(root.textContent).toContain("Version 21");
      expect(root.textContent).not.toContain("Version 20");
      expect(root.textContent).not.toContain("Show more");
    });

    it("moves focus to the first newly shown version after See all history", async () => {
      const fake = changedModels();
      fake.setHistory(manyVersions(25));
      const root = await openPhonePage(fake);
      const seeAll = [...root.querySelectorAll("button")].find(
        (element) => element.textContent?.trim() === "See all history",
      );
      seeAll?.focus();
      act(() => seeAll?.click());
      const focusedRow = document.activeElement?.closest("[data-row-id]");
      expect(focusedRow?.getAttribute("data-row-id")).toBe("v20");
      expect(document.activeElement?.textContent).toContain("Version 20");
    });

    it("opens a version as its own page and goes back to its row in History", async () => {
      const fake = changedModels();
      const versions = manyVersions(3).map((version) =>
        version.id === "v2"
          ? { ...version, notes: "Sorter replies in Dutch", files: ["agents/sorter.yaml"] }
          : version,
      );
      fake.setHistory(versions);
      const root = await openPhonePage(fake);
      await act(async () => {
        historyRow(root, "Version 2").click();
        await settle();
      });
      expect(topBarTitle(root)).toBe("Version 2");
      const heading = root.querySelector("h1");
      expect(heading?.textContent).toBe("Version 2");
      expect(heading?.className).toContain("sr-only");
      expect(document.activeElement).toBe(heading);
      expect(buttonsNamed(root, "Back to History")).toHaveLength(0);
      expect(root.textContent).toContain("Sam Lee · ");
      expect(root.textContent).toContain("Sorter replies in Dutch");
      expect(root.textContent).toContain("What's in it · 1 item");
      expect(root.textContent).toContain("sorter.yaml");
      expect(root.textContent).not.toContain("Create version");
      act(() => topBarBack(root)?.click());
      expect(topBarTitle(root)).toBe("Changes");
      expect(root.querySelector("h1")?.textContent).toBe("Changes");
      expect(document.activeElement?.closest("[data-row-id]")?.getAttribute("data-row-id")).toBe(
        "v2",
      );
    });

    it("shows the Changes page when a later read no longer has the open version, and stays there", async () => {
      const fake = changedModels();
      const versions = manyVersions(3);
      fake.setHistory(versions);
      const root = await openPhonePage(fake);
      act(() => historyRow(root, "Version 2").click());
      expect(topBarTitle(root)).toBe("Version 2");
      expect(root.querySelector("h1")?.textContent).toBe("Version 2");
      fake.setHistory(versions.filter((version) => version.id !== "v2"));
      fake.wake();
      await act(settle);
      expect(topBarTitle(root)).toBe("Changes");
      expect(root.querySelector("h1")?.textContent).toBe("Changes");
      fake.setHistory(versions);
      fake.wake();
      await act(settle);
      expect(topBarTitle(root)).toBe("Changes");
      expect(root.querySelector("h1")?.textContent).toBe("Changes");
    });

    it("unfolds History when going back to a version past the newest 5", async () => {
      const fake = changedModels();
      fake.setHistory(manyVersions(25));
      const root = await openPhonePage(fake);
      act(() => buttonsNamed(root, "See all history")[0]?.click());
      act(() => historyRow(root, "Version 18").click());
      act(() => topBarBack(root)?.click());
      expect(root.textContent).not.toContain("See all history");
      expect(document.activeElement?.closest("[data-row-id]")?.getAttribute("data-row-id")).toBe(
        "v18",
      );
    });

    it("shows all of a short History with no See all history", async () => {
      const fake = changedModels();
      fake.setHistory(manyVersions(5));
      const root = await openPhonePage(fake);
      expect(root.textContent).toContain("Version 1");
      expect(root.textContent).not.toContain("See all history");
    });

    it("says Halonic on the computer isn't answering when History can't load", async () => {
      const fake = changedModels();
      fake.failHistory(new Error("boom"));
      const root = await openPhonePage(fake);
      expect(root.textContent).toContain("Halonic on your computer isn't answering.");
    });
  });
});
