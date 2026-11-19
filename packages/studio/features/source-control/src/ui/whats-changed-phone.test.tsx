// @vitest-environment jsdom

import { createToastStore, PresentationProvider, ToastStoreProvider } from "@halonicjs/studio-kit";
import type { ItemRef } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChangesList } from "../changes-list.ts";
import { fakeSource, settle } from "../source.test-helper.ts";
import { buttonsNamed } from "../test-support/buttons.ts";
import { openItem } from "../test-support/open-item.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ChangesView } from "./changes-page.tsx";

afterEach(unmountAll);

const lines = (...all: string[]) => `${all.join("\n")}\n`;
const agentPath = "agents/triage.agent.yaml";
const before = lines("id: triage", "name: Triage", "model: claude", "instructions: Sort mail.");
const after = lines("id: triage", "name: Triage", "model: gpt", "instructions: Sort all mail.");
const skillPaths = ["library/skills/tone/SKILL.md", "library/skills/tone/notes.md"] as const;
const otherPath = "notes/plan.bin";

async function openPhonePage(openItemOf?: (item: ItemRef) => void) {
  const fake = fakeSource({
    kind: "ready",
    changes: [
      { path: agentPath, status: "modified", staged: false },
      ...skillPaths.map((path) => ({ path, status: "modified" as const, staged: false })),
      { path: otherPath, status: "modified", staged: false },
    ],
  });
  fake.setTexts(agentPath, { before, after });
  for (const path of skillPaths)
    fake.setTexts(path, { before: "Be brief.\n", after: "Be kind.\n" });
  fake.setTexts(otherPath, { before: "one\n", after: "two\n" });
  const toasts = createToastStore();
  const root = render(
    <PresentationProvider presentation="phone">
      <ToastStoreProvider store={toasts}>
        <ChangesView list={new ChangesList(fake.source)} openItem={openItemOf} />
      </ToastStoreProvider>
    </PresentationProvider>,
  );
  await act(settle);
  return { fake, root, toasts };
}

function buttons(root: ParentNode, name: string): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("button")].filter(
    (element) => element.textContent?.trim() === name,
  );
}

/** The page's bottom bar: the kit ActionBar. */
function bottomBar(page: HTMLElement): HTMLElement {
  const bar = page.querySelector<HTMLElement>(".action-bar");
  if (bar === null) throw new Error("the page has no bottom bar");
  return bar;
}

/** Undo these changes, found by the name a screen reader hears. */
function undoButtons(root: ParentNode): HTMLElement[] {
  return buttonsNamed(root, "Undo these changes");
}

verifies("source-control.whats-changed-phone", () => {
  describe("What changed on a phone", () => {
    it("puts Undo these changes in the bottom bar and nothing else in the header", async () => {
      const { root } = await openPhonePage(vi.fn());
      const page = openItem(root, "Triage");
      const bar = bottomBar(page);
      expect(undoButtons(bar)).toHaveLength(1);
      expect(undoButtons(page)).toHaveLength(1);
      expect(buttons(page, "Open agent")).toHaveLength(0);
    });

    it("opens the item from its 48px Open row", async () => {
      const opened = vi.fn();
      const { root } = await openPhonePage(opened);
      const page = openItem(root, "Triage");
      const row = buttons(page, "Open Triage")[0];
      expect(row?.className).toContain("min-h-touch");
      // The kit's icons have no size of their own: a bare chevron would fill the row.
      const chevron = row?.querySelector("svg")?.parentElement;
      expect(chevron).not.toBe(row);
      expect(chevron?.className).toContain("size-icon-md");
      await act(async () => row?.click());
      expect(opened).toHaveBeenCalledWith({ kind: "agent", hub: "", id: "triage" });
    });

    it("has no Open row for a skill, or when the window can't open items", async () => {
      const { root } = await openPhonePage(vi.fn());
      expect(buttons(openItem(root, "tone"), "Open tone")).toHaveLength(0);
      const without = await openPhonePage();
      expect(buttons(openItem(without.root, "Triage"), "Open Triage")).toHaveLength(0);
    });

    it("shows the changes in words, with no Advanced and no line diff", async () => {
      const { root } = await openPhonePage();
      const page = openItem(root, "Triage");
      expect(page.querySelector("del, ins")).not.toBeNull();
      expect(buttons(page, "Advanced")).toHaveLength(0);
      expect(page.textContent).not.toContain("Lines ");
    });

    it("says a file it can't describe is CHANGED, by its name, with no line diff, and keeps Undo", async () => {
      const { root } = await openPhonePage();
      const page = openItem(root, "plan.bin");
      expect(page.textContent).toContain("CHANGED");
      expect(page.querySelector("code")?.textContent).toBe(otherPath);
      expect(page.textContent).not.toContain("Lines ");
      expect(undoButtons(bottomBar(page))).toHaveLength(1);
    });

    it("closes after Undo from the bar, with the toast and focus on the row that took its place", async () => {
      const { root, toasts } = await openPhonePage();
      const page = openItem(root, "tone");
      await act(async () => {
        undoButtons(bottomBar(page))[0]?.click();
        await settle();
      });
      expect(root.textContent).toContain("Since your last version");
      expect(toasts.list()[0]?.title).toBe("Undid changes to tone.");
      expect(document.activeElement?.textContent).toContain("plan.bin");
    });

    it("shows a failed roll-back's warning first, above the item's name", async () => {
      const { fake, root } = await openPhonePage();
      const page = openItem(root, "tone");
      fake.setTexts(skillPaths[1], { before: "Be brief.\n", after: "Edited elsewhere.\n" });
      const replaceFile = fake.source.replaceFile.bind(fake.source);
      let writes = 0;
      vi.spyOn(fake.source, "replaceFile").mockImplementation(async (path, text, expected) => {
        writes += 1;
        // The third write is the roll-back of the first file.
        return writes === 3 ? "changed-on-disk" : replaceFile(path, text, expected);
      });
      await act(async () => {
        undoButtons(bottomBar(page))[0]?.click();
        await settle();
      });
      const callout = page.querySelector<HTMLElement>('[role="group"]');
      const heading = page.querySelector("h1");
      expect(callout).not.toBeNull();
      expect(
        heading !== null &&
          callout !== null &&
          Boolean(callout.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING),
      ).toBe(true);
    });
  });
});
