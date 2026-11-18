// @vitest-environment jsdom
import {
  createToastStore,
  TOAST_WITH_ACTION_CLOSES_AFTER_MS,
  ToastStoreProvider,
} from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DeveloperView } from "../api.ts";
import { ChangesList } from "../changes-list.ts";
import { fakeSource, settle } from "../source.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { openItem } from "../test-support/open-item.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ChangesView } from "./changes-page.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const lines = (...all: string[]) => `${all.join("\n")}\n`;
const hub = "hubs/sales/hub.yaml";
const before = lines("a", "b", "c", "d", "e", "f", "g", "h");
const after = lines("A", "b", "c", "d", "e", "f", "g", "H");
/** A file Halonic describes in words, so its Advanced starts closed. */
const agent = "agents/triage.agent.yaml";
const agentBefore = lines("id: triage", "name: Triage", "model: claude");
const agentAfter = lines("id: triage", "name: Triage", "model: gpt");

function developerView(initial: boolean) {
  let on = initial;
  const listeners = new Set<() => void>();
  const view: DeveloperView = {
    enabled: () => on,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    view,
    turn: (next: boolean) => {
      on = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

async function openPage(
  options: {
    developer?: boolean;
    staged?: boolean;
    texts?: { before: string; after: string };
  } = {},
) {
  const fake = fakeSource({
    kind: "ready",
    changes: [
      { path: hub, status: "modified", staged: options.staged ?? false },
      { path: "skills/tone/SKILL.md", status: "untracked", staged: false },
      { path: "old/gone.md", status: "deleted", staged: false },
      { path: agent, status: "modified", staged: false },
    ],
  });
  fake.setTexts(agent, { before: agentBefore, after: agentAfter });
  fake.setTexts(hub, options.texts ?? { before, after });
  fake.setTexts("skills/tone/SKILL.md", { before: null, after: "Be kind.\n" });
  fake.setTexts("old/gone.md", { before: "bye\n", after: null });
  const toasts = createToastStore();
  const developer = developerView(options.developer ?? false);
  const list = new ChangesList(fake.source);
  const root = render(
    <ToastStoreProvider store={toasts}>
      <ChangesView list={list} developerView={developer.view} />
    </ToastStoreProvider>,
  );
  await act(settle);
  return { fake, root, toasts, developer };
}

function buttons(root: ParentNode, name: string): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("button")].filter(
    (element) => element.textContent?.trim() === name,
  );
}

async function press(button: HTMLElement | undefined) {
  await act(async () => {
    button?.click();
    await settle();
  });
}

/** What a row is called: an item by its name, a file no kind places by its file name. */
const rowNames: Readonly<Record<string, string>> = {
  [hub]: "sales",
  "skills/tone/SKILL.md": "SKILL.md",
  "old/gone.md": "gone.md",
  [agent]: "Triage",
};
const section = (root: HTMLElement, path: string) => openItem(root, rowNames[path] ?? path);

verifies("source-control.discard", () => {
  describe("Undo these changes", () => {
    it("puts a changed file back at once, keeps a copy and offers Undo on the toast", async () => {
      const { fake, root, toasts } = await openPage();
      await press(buttons(section(root, hub), "Undo these changes")[0]);
      expect(fake.kept).toEqual([[{ path: hub, text: after }]]);
      expect(fake.replaced[0]).toEqual({ path: hub, text: before, expected: after });
      const toast = toasts.list()[0];
      expect(toast?.title).toBe("Undid changes to sales.");
      expect(toast?.text).toBeUndefined();
      expect(toast?.action?.label).toBe("Undo");
      await act(async () => {
        toast?.action?.onClick();
        await settle();
      });
      expect(fake.replaced[1]).toEqual({ path: hub, text: after, expected: before });
    });

    it("deletes a new file, and Undo writes it back", async () => {
      const { fake, root, toasts } = await openPage();
      await press(buttons(section(root, "skills/tone/SKILL.md"), "Undo these changes")[0]);
      expect(fake.kept[0]).toEqual([{ path: "skills/tone/SKILL.md", text: "Be kind.\n" }]);
      expect(fake.removed).toEqual([{ path: "skills/tone/SKILL.md", expected: "Be kind.\n" }]);
      await act(async () => {
        toasts.list()[0]?.action?.onClick();
        await settle();
      });
      expect(fake.replaced.at(-1)).toEqual({
        path: "skills/tone/SKILL.md",
        text: "Be kind.\n",
        expected: null,
      });
    });

    it("shows the first lines of a new file", async () => {
      const { root } = await openPage();
      const page = section(root, "skills/tone/SKILL.md");
      expect(
        page.querySelector('[aria-label="First lines of skills/tone/SKILL.md"] pre')?.textContent,
      ).toBe("Be kind.");
    });

    it("brings a deleted file back, and Undo deletes it again", async () => {
      const { fake, root, toasts } = await openPage();
      await press(buttons(section(root, "old/gone.md"), "Undo these changes")[0]);
      expect(fake.kept).toHaveLength(0);
      expect(fake.replaced[0]).toEqual({ path: "old/gone.md", text: "bye\n", expected: null });
      await act(async () => {
        toasts.list()[0]?.action?.onClick();
        await settle();
      });
      expect(fake.removed).toEqual([{ path: "old/gone.md", expected: "bye\n" }]);
    });

    it("asks first, with Cancel focused, when the copy can't be kept, and changes nothing", async () => {
      const { fake, root } = await openPage();
      fake.failKeep(new Error("disk full"));
      await press(buttons(section(root, hub), "Undo these changes")[0]);
      const dialog = document.querySelector("dialog");
      expect(dialog?.textContent).toContain("Undo changes to sales?");
      expect(dialog?.textContent).toContain(
        "Halonic couldn't keep a copy, so this can't be undone.",
      );
      expect(fake.replaced).toHaveLength(0);
      expect(document.activeElement?.textContent?.trim()).toBe("Cancel");
      await press(buttons(dialog as HTMLElement, "Cancel")[0]);
      expect(document.querySelector("dialog")).toBeNull();
      expect(fake.replaced).toHaveLength(0);
    });

    it("goes on without a copy when asked, with a toast that has no Undo", async () => {
      const { fake, root, toasts } = await openPage();
      fake.failKeep(new Error("disk full"));
      await press(buttons(section(root, hub), "Undo these changes")[0]);
      const dialog = document.querySelector("dialog") as HTMLElement;
      // The kit keeps the busy label in the button too, so its text is both.
      await press(buttons(dialog, "Undo changesUndoing…")[0]);
      expect(fake.replaced[0]).toEqual({ path: hub, text: before, expected: after });
      expect(toasts.list()[0]?.title).toBe("Undid changes to sales.");
      expect(toasts.list()[0]?.action).toBeUndefined();
    });

    it("keeps the toast open for 10 seconds, with its Undo", async () => {
      const { root, toasts } = await openPage();
      await press(buttons(section(root, hub), "Undo these changes")[0]);
      expect(toasts.list()[0]?.action?.label).toBe("Undo");
      expect(TOAST_WITH_ACTION_CLOSES_AFTER_MS).toBe(10_000);
    });

    it("writes nothing when the file changed since the page read it", async () => {
      const { fake, root, toasts } = await openPage();
      fake.setTexts(hub, { before, after: `${after}# edited elsewhere\n` });
      await press(buttons(section(root, hub), "Undo these changes")[0]);
      expect(toasts.list()[0]).toMatchObject({
        tone: "danger",
        title: "Couldn't discard these changes",
        text: expect.stringContaining("The file changed while you were looking."),
      });
      expect(toasts.list()[0]?.action).toBeUndefined();
      expect(section(root, hub).querySelector('[role="alert"]')).toBeNull();
    });

    it("says a file another program added to a version can't be discarded here", async () => {
      const { fake, root, toasts } = await openPage({ staged: true });
      await press(buttons(section(root, hub), "Undo these changes")[0]);
      expect(fake.replaced).toHaveLength(0);
      expect(toasts.list()[0]?.text).toContain("Another program added this file to a version.");
    });

    it("shows why the toast's Undo didn't work when the file changed in the meantime", async () => {
      const { fake, root, toasts } = await openPage();
      await press(buttons(section(root, hub), "Undo these changes")[0]);
      fake.setTexts(hub, { before, after: "edited\n" });
      await act(async () => {
        toasts.list()[0]?.action?.onClick();
        await settle();
      });
      expect(toasts.list().find((t) => t.title === "Couldn't put the changes back")?.tone).toBe(
        "danger",
      );
    });
  });

  describe("developer view", () => {
    it("has no Discard or Discard this part while it is off, though Advanced lists the lines", async () => {
      const { root } = await openPage();
      const page = section(root, hub);
      expect(page.textContent).toContain("+ H");
      expect(buttons(root, "Discard")).toHaveLength(0);
      expect(buttons(root, "Discard this part")).toHaveLength(0);
    });

    it("reads Discard for the file once it is turned on", async () => {
      const { root, developer } = await openPage();
      await act(async () => developer.turn(true));
      expect(buttons(section(root, hub), "Discard")).toHaveLength(1);
      // The page's own button undoes the whole item; only the file's button changes its word.
      expect(buttons(root, "Undo these changes")).toHaveLength(1);
    });

    it("discards only one part, keeps the other and offers Undo", async () => {
      const { fake, root, toasts } = await openPage({ developer: true });
      expect(section(root, hub).textContent).toContain("- a");
      expect(section(root, hub).textContent).toContain("+ H");
      const parts = buttons(section(root, hub), "Discard this part");
      expect(parts).toHaveLength(2);
      await press(parts[0]);
      expect(fake.replaced[0]).toEqual({
        path: hub,
        text: lines("a", "b", "c", "d", "e", "f", "g", "H"),
        expected: after,
      });
      expect(fake.kept[0]).toEqual([{ path: hub, text: after }]);
      expect(toasts.list()[0]?.title).toBe("Discarded this part");
      await act(async () => {
        toasts.list()[0]?.action?.onClick();
        await settle();
      });
      expect(fake.replaced[1]?.text).toBe(after);
    });

    it("discards one part of a described file after Advanced is pressed", async () => {
      const { fake, root, toasts } = await openPage({ developer: true });
      const page = section(root, agent);
      expect(buttons(page, "Discard this part")).toHaveLength(0);
      await press(buttons(page, "Advanced")[0]);
      await press(buttons(page, "Discard this part")[0]);
      expect(fake.replaced[0]).toEqual({ path: agent, text: agentBefore, expected: agentAfter });
      expect(toasts.list()[0]?.title).toBe("Discarded this part");
    });

    it("ignores a second press on Discard this part while the first is working", async () => {
      const { fake, root } = await openPage({ developer: true });
      const [part] = buttons(section(root, hub), "Discard this part");
      await act(async () => {
        part?.click();
        part?.click();
        await settle();
      });
      expect(fake.replaced).toHaveLength(1);
    });

    it("discards the whole file with Discard", async () => {
      const { fake, root } = await openPage({ developer: true });
      await press(buttons(section(root, hub), "Discard")[0]);
      expect(fake.replaced[0]?.text).toBe(before);
    });

    it("offers no Advanced for a new or deleted file", async () => {
      const { root } = await openPage({ developer: true });
      expect(buttons(section(root, "skills/tone/SKILL.md"), "Advanced")).toHaveLength(0);
      expect(buttons(section(root, "old/gone.md"), "Advanced")).toHaveLength(0);
    });
  });
});

verifies("source-control.line-diff", () => {
  it("heads each part with where it is and says added and removed lines in words", async () => {
    const { root } = await openPage({ developer: true });
    const text = section(root, hub).textContent ?? "";
    expect(text).toContain("Line 1");
    expect(text).toContain("Line 8");
    expect(text).toContain("Removed line: - a");
    expect(text).toContain("Added line: + A");
  });

  it("shows a described file's lines only once Advanced is pressed", async () => {
    const { root } = await openPage();
    const page = section(root, agent);
    const advanced = buttons(page, "Advanced")[0];
    expect(advanced?.getAttribute("aria-expanded")).toBe("false");
    expect(page.textContent).not.toContain("Removed line:");
    await press(advanced);
    expect(advanced?.getAttribute("aria-expanded")).toBe("true");
    expect(page.textContent).toContain("Line 3");
    expect(page.textContent).toContain("Removed line: - model: claude");
    expect(page.textContent).toContain("Added line: + model: gpt");
  });

  it("heads a part of several lines with the first and last line it covers", async () => {
    const { root } = await openPage({
      developer: true,
      texts: {
        before: lines("a", "b", "c", "d"),
        after: lines("a", "B", "C", "d"),
      },
    });
    expect(section(root, hub).textContent).toContain("Lines 2 to 3");
  });
});
