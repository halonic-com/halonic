// @vitest-environment jsdom

import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import type { ItemRef } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChangesList } from "../changes-list.ts";
import { fakeSource, settle } from "../source.test-helper.ts";
import { openItem } from "../test-support/open-item.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ChangesView } from "./changes-page.tsx";

afterEach(unmountAll);

const lines = (...all: string[]) => `${all.join("\n")}\n`;
const agentPath = "agents/triage.agent.yaml";
const before = lines("id: triage", "name: Triage", "model: claude", "instructions: Sort mail.");
const after = lines("id: triage", "name: Triage", "model: gpt", "instructions: Sort all mail.");
const skillPaths = ["library/skills/tone/SKILL.md", "library/skills/tone/notes.md"] as const;

async function openPage(openItemOf?: (item: ItemRef) => void) {
  const fake = fakeSource({
    kind: "ready",
    changes: [
      { path: agentPath, status: "modified", staged: false },
      ...skillPaths.map((path) => ({ path, status: "modified" as const, staged: false })),
    ],
  });
  fake.setTexts(agentPath, { before, after });
  for (const path of skillPaths)
    fake.setTexts(path, { before: "Be brief.\n", after: "Be kind.\n" });
  const toasts = createToastStore();
  const root = render(
    <ToastStoreProvider store={toasts}>
      <ChangesView list={new ChangesList(fake.source)} openItem={openItemOf} />
    </ToastStoreProvider>,
  );
  await act(settle);
  return { fake, root, toasts };
}

function buttons(root: ParentNode, name: string): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("button")].filter(
    (element) => element.textContent?.trim() === name,
  );
}

verifies("source-control.whats-changed-page", () => {
  describe("What changed page", () => {
    it("opens in place of the list with the item's name as the only h1, and focus on it", async () => {
      const { root } = await openPage();
      openItem(root, "Triage");
      expect(root.textContent).not.toContain("Since your last version");
      expect(document.activeElement?.tagName).toBe("H1");
      expect(document.activeElement?.textContent).toBe("Triage");
      expect(root.querySelectorAll("h1")).toHaveLength(1);
    });

    it("shows a new skill's fields under New skill, and its file only under Advanced", async () => {
      const path = "library/skills/refunds/SKILL.md";
      const text = lines(
        "---",
        "name: Refund handling",
        "description: Use it for refund questions.",
        "---",
        "Check the order first.",
      );
      const fake = fakeSource({
        kind: "ready",
        changes: [{ path, status: "untracked", staged: false }],
      });
      fake.setTexts(path, { before: null, after: text });
      const root = render(<ChangesView list={new ChangesList(fake.source)} />);
      await act(settle);
      const page = openItem(root, "Refund handling");
      expect(page.textContent).toContain("New skill");
      const fields = [...page.querySelectorAll("dl > div")].map((field) => [
        field.querySelector("dt")?.textContent,
        field.querySelector("dd")?.textContent,
      ]);
      expect(fields).toEqual([
        ["Name", "Refund handling"],
        ["When to use it", "Use it for refund questions."],
        ["Instructions", "Check the order first."],
      ]);
      expect(page.textContent).not.toContain("---");
      const advanced = buttons(page, "Advanced")[0];
      expect(advanced?.getAttribute("aria-expanded")).toBe("false");
      await act(async () => advanced?.click());
      expect(page.querySelector(`[aria-label="The whole of ${path}"] pre`)?.textContent).toBe(text);
    });

    it("puts focus on the row it came from when the person presses Back to Changes", async () => {
      const { root } = await openPage();
      openItem(root, "Triage");
      await act(async () => buttons(root, "Back to Changes")[0]?.click());
      expect(root.textContent).toContain("Since your last version");
      expect(document.activeElement?.textContent).toContain("Triage");
    });

    it("keeps the headings in order: one h1, then h2s, with no level skipped", async () => {
      const { root } = await openPage();
      const page = openItem(root, "Triage");
      const levels = (heading: ParentNode) =>
        [...heading.querySelectorAll("h1, h2, h3, h4, h5")].map((element) =>
          Number(element.tagName.slice(1)),
        );
      const skipsALevel = (all: number[]) =>
        all.some((level, index) => level > (all[index - 1] ?? 0) + 1);
      expect(levels(page)).toEqual([1, 2, 2]);
      const several = levels(openItem(root, "tone"));
      expect(several[0]).toBe(1);
      expect(skipsALevel(several)).toBe(false);
    });

    it("puts the line headings of Advanced a level under the heading above them", async () => {
      const { root } = await openPage();
      const lineHeadings = (page: ParentNode) =>
        [...page.querySelectorAll("h2, h3")]
          .filter((element) => element.textContent?.startsWith("Line"))
          .map((element) => element.tagName);
      // One file: straight under the page's h1.
      const one = openItem(root, "Triage");
      await act(async () => buttons(one, "Advanced")[0]?.click());
      expect(lineHeadings(one).length).toBeGreaterThan(0);
      expect(new Set(lineHeadings(one))).toEqual(new Set(["H2"]));
      // Several files: under each file's path, an h2.
      await act(async () => buttons(root, "Back to Changes")[0]?.click());
      const several = openItem(root, "tone");
      // Advanced starts open on a file Halonic can't put in words; open the others.
      for (const advanced of buttons(several, "Advanced")) {
        if (advanced.getAttribute("aria-expanded") === "false") {
          await act(async () => advanced.click());
        }
      }
      expect(lineHeadings(several).length).toBeGreaterThan(0);
      expect(new Set(lineHeadings(several))).toEqual(new Set(["H3"]));
    });

    it("opens the item itself with Open agent, from its hub", async () => {
      const opened = vi.fn();
      const { root } = await openPage(opened);
      openItem(root, "Triage");
      await act(async () => buttons(root, "Open agent")[0]?.click());
      expect(opened).toHaveBeenCalledWith({ kind: "agent", hub: "", id: "triage" });
    });

    it("has no Open button when the window can't open items, or for a skill", async () => {
      const { root } = await openPage();
      openItem(root, "Triage");
      expect(buttons(root, "Open agent")).toHaveLength(0);
      const withOpener = await openPage(vi.fn());
      openItem(withOpener.root, "tone");
      expect(buttons(withOpener.root, "Open skill")).toHaveLength(0);
    });

    it("undoes every file of the item at once, with one toast whose Undo puts them all back", async () => {
      const { fake, root, toasts } = await openPage();
      const page = openItem(root, "tone");
      await act(async () => {
        buttons(page, "Undo these changes")[0]?.click();
        await settle();
      });
      expect(fake.replaced.map((file) => file.path)).toEqual([...skillPaths]);
      expect(toasts.list()).toHaveLength(1);
      await act(async () => {
        toasts.list()[0]?.action?.onClick();
        await settle();
      });
      expect(fake.replaced).toHaveLength(4);
    });

    it("leaves the item as it was, with no toast, when one of its files can't go back", async () => {
      const { fake, root, toasts } = await openPage();
      const page = openItem(root, "tone");
      const [first, second] = skillPaths;
      fake.setTexts(second, { before: "Be brief.\n", after: "Edited elsewhere.\n" });
      await act(async () => {
        buttons(page, "Undo these changes")[0]?.click();
        await settle();
      });
      // The first file went back, the second was refused, and the first was put the way it was.
      expect(fake.replaced).toEqual([
        { path: first, text: "Be brief.\n", expected: "Be kind.\n" },
        { path: second, text: "Be brief.\n", expected: "Be kind.\n" },
        { path: first, text: "Be kind.\n", expected: "Be brief.\n" },
      ]);
      expect(toasts.list()).toHaveLength(1);
      expect(toasts.list()[0]).toMatchObject({
        tone: "danger",
        title: "Couldn't discard these changes",
      });
      expect(toasts.list()[0]?.text).toContain("The file changed while you were looking.");
      expect(toasts.list()[0]?.action).toBeUndefined();
      expect(page.querySelector('[role="alert"]')).toBeNull();
    });

    it("shows a warning with the files not put back, and Try again, when the roll-back fails too", async () => {
      const { fake, root, toasts } = await openPage();
      const page = openItem(root, "tone");
      const [first, second] = skillPaths;
      fake.setTexts(second, { before: "Be brief.\n", after: "Edited elsewhere.\n" });
      const replaceFile = fake.source.replaceFile.bind(fake.source);
      let writes = 0;
      vi.spyOn(fake.source, "replaceFile").mockImplementation(async (path, text, expected) => {
        writes += 1;
        // The third write is the roll-back of the first file.
        return writes === 3 ? "changed-on-disk" : replaceFile(path, text, expected);
      });
      await act(async () => {
        buttons(page, "Undo these changes")[0]?.click();
        await settle();
      });
      expect(toasts.list()).toHaveLength(0);
      const callout = page.querySelector<HTMLElement>('[role="group"]');
      expect(callout?.textContent).toContain("Couldn't undo all changes to tone");
      expect(callout?.textContent).toContain(first);
      expect(callout?.textContent).not.toContain(second);
      expect(document.activeElement).toBe(callout);
      // The kit keeps the busy label in the button too, so its text is both.
      expect(buttons(callout as HTMLElement, "Try againUndoing…")).toHaveLength(1);
    });

    it("finishes the undo when the person presses Try again, and clears the warning", async () => {
      const { fake, root, toasts } = await openPage();
      const page = openItem(root, "tone");
      const [first, second] = skillPaths;
      fake.setTexts(second, { before: "Be brief.\n", after: "Edited elsewhere.\n" });
      const replaceFile = fake.source.replaceFile.bind(fake.source);
      let writes = 0;
      vi.spyOn(fake.source, "replaceFile").mockImplementation(async (path, text, expected) => {
        writes += 1;
        return writes === 3 ? "changed-on-disk" : replaceFile(path, text, expected);
      });
      await act(async () => {
        buttons(page, "Undo these changes")[0]?.click();
        await settle();
      });
      // The first file is back at its last version, the second is still changed.
      fake.setTexts(second, { before: "Be brief.\n", after: "Be kind.\n" });
      const callout = page.querySelector<HTMLElement>('[role="group"]');
      await act(async () => {
        buttons(callout as HTMLElement, "Try againUndoing…")[0]?.click();
        await settle();
      });
      expect(fake.replaced.at(-1)).toEqual({
        path: second,
        text: "Be brief.\n",
        expected: "Be kind.\n",
      });
      expect(fake.replaced.filter((write) => write.path === first)).toHaveLength(1);
      expect(root.querySelector('[role="group"]')).toBeNull();
      expect(toasts.list()[0]?.title).toBe("Undid changes to tone.");
    });
  });
});
