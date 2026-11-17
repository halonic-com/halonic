// @vitest-environment jsdom
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { DeveloperView } from "../api.ts";
import { ChangesList } from "../changes-list.ts";
import { fakeSource, settle } from "../source.test-helper.ts";
import { openItem } from "../test-support/open-item.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ChangesView } from "./changes-page.tsx";

afterEach(unmountAll);

const lines = (...all: string[]) => `${all.join("\n")}\n`;
const hub = "hubs/sales/hub.yaml";
const before = lines("a", "b", "c", "d", "e", "f", "g", "h");
const after = lines("A", "b", "c", "d", "e", "f", "g", "H");

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
    ],
  });
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
      expect(toast?.title).toBe("Discarded sales");
      expect(toast?.text).toBeUndefined();
      expect(toast?.action?.label).toBe("Put it back");
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

    it("discards nothing and says why when the copy can't be kept", async () => {
      const { fake, root } = await openPage();
      fake.failKeep(new Error("disk full"));
      await press(buttons(section(root, hub), "Undo these changes")[0]);
      expect(fake.replaced).toHaveLength(0);
      expect(section(root, hub).querySelector('[role="alert"]')?.textContent).toContain(
        "Halonic couldn't keep a copy, so nothing was discarded.",
      );
    });

    it("writes nothing when the file changed since the page read it", async () => {
      const { fake, root } = await openPage();
      fake.setTexts(hub, { before, after: `${after}# edited elsewhere\n` });
      await press(buttons(section(root, hub), "Undo these changes")[0]);
      expect(section(root, hub).querySelector('[role="alert"]')?.textContent).toContain(
        "Couldn't discard these changes. The file changed while you were looking.",
      );
    });

    it("says a file another program added to a version can't be discarded here", async () => {
      const { fake, root } = await openPage({ staged: true });
      await press(buttons(section(root, hub), "Undo these changes")[0]);
      expect(fake.replaced).toHaveLength(0);
      expect(section(root, hub).querySelector('[role="alert"]')?.textContent).toContain(
        "Another program added this file to a version.",
      );
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
