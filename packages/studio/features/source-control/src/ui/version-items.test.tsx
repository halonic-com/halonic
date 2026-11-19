// @vitest-environment jsdom
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ChangesSource, Version } from "../api.ts";
import { ChangesList } from "../changes-list.ts";
import { fakeSource, settle } from "../source.test-helper.ts";
import { installFakePopover } from "../test-support/popover.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ChangesView } from "./changes-page.tsx";

let removePopover = () => {};
beforeEach(() => {
  removePopover = installFakePopover();
});
afterEach(() => {
  unmountAll();
  removePopover();
});

const sorter = "agents/sorter.agent.yaml";
const dutch: Version = {
  id: "d".repeat(40),
  name: "Sorter replies in Dutch",
  notes: "",
  author: "Sam Lee",
  at: Date.now() - 60_000,
  files: [sorter, "README.md"],
};

/** A workspace whose Sorter changed since "Sorter replies in Dutch". */
function changedSorter() {
  const fake = fakeSource({ kind: "ready", changes: [] });
  fake.setHistory([dutch]);
  fake.setTexts(sorter, { before: "model: b\n", after: "model: c\n" });
  fake.setAtVersion(dutch.id, sorter, "model: a\n");
  return fake;
}

async function pickVersion(source: ChangesSource) {
  const toasts = createToastStore();
  const root = render(
    <ToastStoreProvider store={toasts}>
      <ChangesView list={new ChangesList(source)} />
    </ToastStoreProvider>,
  );
  await act(settle);
  const row = [...root.querySelectorAll<HTMLElement>('[role="gridcell"]')].find((cell) =>
    cell.textContent?.includes(dutch.name),
  );
  await act(async () => row?.click());
  return { root, toasts };
}

async function openMenu(root: HTMLElement, name: string) {
  const more = root.querySelector<HTMLElement>(`button[aria-label="More actions for ${name}"]`);
  if (more === null) throw new Error(`no ⋮ for ${name}`);
  await act(async () => more.click());
}

const restoreEntry = () =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
    item.textContent?.includes("Restore just this"),
  );

async function restoreSorter(root: HTMLElement) {
  await openMenu(root, "sorter");
  await act(async () => {
    restoreEntry()?.click();
    await settle();
  });
}

verifies("source-control.history-restore", () => {
  describe("Restore just this", () => {
    it("lists the version's items with their files, an item's files on one row", async () => {
      const { root } = await pickVersion(changedSorter().source);
      const details = root.querySelector('[aria-label^="Version"]');
      expect(details?.textContent).toContain("sorter");
      expect(details?.textContent).toContain(sorter);
      expect(details?.textContent).toContain("README.md");
    });

    it("restores the item at once, with a toast whose Undo puts the newer one back", async () => {
      const fake = changedSorter();
      const { root, toasts } = await pickVersion(fake.source);
      await restoreSorter(root);
      expect(await fake.source.readFile(sorter)).toBe("model: a\n");
      const [toast] = toasts.list();
      expect(toast?.title).toBe('Restored sorter from "Sorter replies in Dutch".');
      expect(toast?.action?.label).toBe("Undo");
      await act(async () => {
        toast?.action?.onClick();
        await settle();
      });
      expect(await fake.source.readFile(sorter)).toBe("model: c\n");
    });

    it("shows a danger toast and changes nothing when no copy can be kept", async () => {
      const fake = changedSorter();
      fake.failKeep(new Error("The disk is full."));
      const { root, toasts } = await pickVersion(fake.source);
      await restoreSorter(root);
      expect(fake.replaced).toEqual([]);
      expect(toasts.list()[0]?.tone).toBe("danger");
      expect(toasts.list()[0]?.title).toBe("Couldn't restore sorter");
    });

    it("shows the warning Callout, with focus, when putting the files back fails too", async () => {
      const skill = "library/skills/tone/SKILL.md";
      const example = "library/skills/tone/example.md";
      const fake = fakeSource({ kind: "ready", changes: [] });
      fake.setHistory([{ ...dutch, files: [skill, example] }]);
      fake.setTexts(skill, { before: "Be brief.\n", after: "Be very brief.\n" });
      fake.setTexts(example, { before: "Hi.\n", after: "Hello.\n" });
      fake.setAtVersion(dutch.id, skill, "Be kind.\n");
      fake.setAtVersion(dutch.id, example, "Hey.\n");
      // The example changed on disk, and the skill can't be put back either.
      const source: ChangesSource = {
        ...fake.source,
        replaceFile: async (path, text, expected) =>
          path === example || text === "Be very brief.\n"
            ? "changed-on-disk"
            : fake.source.replaceFile(path, text, expected),
      };
      const { root } = await pickVersion(source);
      await openMenu(root, "tone");
      await act(async () => {
        restoreEntry()?.click();
        await settle();
      });
      const callout = root.querySelector<HTMLElement>('[role="group"]');
      expect(document.activeElement).toBe(callout);
      expect(callout?.textContent).toContain(
        'Restored part of tone from "Sorter replies in Dutch".',
      );
      expect(callout?.textContent).toContain(skill);
      expect(callout?.textContent).not.toContain(example);
      expect(callout?.textContent).toContain("Try again");
    });

    it("waits while a merge of updates is started", async () => {
      const fake = changedSorter();
      fake.setMerge({ items: [], versions: 1, people: ["Sam"] });
      const { root } = await pickVersion(fake.source);
      await openMenu(root, "sorter");
      const entry = restoreEntry();
      expect(entry?.getAttribute("aria-disabled")).toBe("true");
      expect(entry?.textContent).toContain("Finish getting updates first.");
      await act(async () => {
        entry?.click();
        await settle();
      });
      expect(fake.replaced).toEqual([]);
    });
  });
});
