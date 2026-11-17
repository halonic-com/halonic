// @vitest-environment jsdom
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { ChangedFile } from "../changes-list.ts";
import { ChangesList } from "../changes-list.ts";
import { fakeSource, settle } from "../source.test-helper.ts";
import { openItem } from "../test-support/open-item.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ChangeList, orderItems } from "./change-list.tsx";
import { ChangesView } from "./changes-page.tsx";
import { useOpenItem } from "./use-open-item.ts";
import { WhatChangedPage } from "./whats-changed-page.tsx";

afterEach(unmountAll);

/** The list and its What changed page for files given directly, without a read from git. */
function ChangesPageOf({ list, files }: { list: ChangesList; files: readonly ChangedFile[] }) {
  const items = orderItems(files);
  const nav = useOpenItem(items, () => undefined);
  if (nav.open === undefined) {
    return (
      <ChangeList
        list={list}
        items={items}
        onOpen={nav.show}
        returnFocus={nav.returnFocus}
        onFocusPlaced={nav.focusPlaced}
      />
    );
  }
  return <WhatChangedPage list={list} item={nav.open} developer={false} onBack={nav.back} />;
}

const lines = (...all: string[]) => `${all.join("\n")}\n`;
const agentPath = "agents/triage.agent.yaml";
const before = lines("id: triage", "name: Triage", "model: claude", "instructions: Sort mail.");
const after = lines("id: triage", "name: Triage", "model: gpt", "instructions: Sort all mail.");

async function openPage() {
  const fake = fakeSource({
    kind: "ready",
    changes: [
      { path: agentPath, status: "modified", staged: false },
      { path: "README.md", status: "modified", staged: false },
      { path: "notes/new.txt", status: "untracked", staged: false },
    ],
  });
  fake.setTexts(agentPath, { before, after });
  fake.setTexts("README.md", { before: "a\n", after: "b\n" });
  const toasts = createToastStore();
  const list = new ChangesList(fake.source);
  const root = render(
    <ToastStoreProvider store={toasts}>
      <ChangesView list={list} />
    </ToastStoreProvider>,
  );
  await act(settle);
  return { fake, root, toasts };
}

function buttons(root: HTMLElement, name: string): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("button")].filter(
    (element) => element.textContent?.trim() === name,
  );
}

verifies("source-control.change-list", () => {
  describe("ChangeList", () => {
    it("lists each changed file with its Important changes first and Undo this change on the ones with parts", async () => {
      const { root } = await openPage();
      const section = openItem(root, "triage");
      expect(section.querySelector("h2")?.textContent).toBe("Important");
      const rows = [...section.querySelectorAll("li")].map((row) => row.textContent);
      expect(rows[0]).toContain("Instructions");
      expect(rows[1]).toContain("Model");
      expect(buttons(section, "Undo this change")).toHaveLength(2);
    });

    it("shows one row for each item with its name and sentence, no path, and Other files by friendly names", async () => {
      const { root } = await openPage();
      const rows = [...root.querySelectorAll("tr[data-row-id]")].map((row) => row.textContent);
      expect(rows).toHaveLength(3);
      expect(rows[0]).toContain("triage");
      expect(rows[0]).toContain("Instructions");
      expect(root.textContent).toContain("Other files");
      expect(root.textContent).not.toContain(agentPath);
      expect(root.textContent).toContain("3 items");
    });

    it("is one Tab stop: only one cell of the list is in the Tab order, and the arrows move", async () => {
      const { root } = await openPage();
      const cells = [...root.querySelectorAll<HTMLElement>('td[role="gridcell"]')];
      expect(cells.filter((cell) => cell.tabIndex === 0)).toHaveLength(1);
      const [first, second] = cells;
      await act(async () => first?.focus());
      await act(async () => {
        first?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      });
      expect(document.activeElement).toBe(second);
    });

    it("opens an item with Enter", async () => {
      const { root } = await openPage();
      const first = root.querySelector<HTMLElement>('td[role="gridcell"]');
      await act(async () => {
        first?.focus();
        first?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      expect(root.querySelector("h1")?.textContent).toBe("triage");
      expect(document.activeElement?.textContent).toBe("triage");
    });

    it("moves focus to the row that took its place after Undo these changes, never to the page", async () => {
      const { fake, root } = await openPage();
      const section = openItem(root, "triage");
      fake.answer({
        kind: "ready",
        changes: [
          { path: "README.md", status: "modified", staged: false },
          { path: "notes/new.txt", status: "untracked", staged: false },
        ],
      });
      await act(async () => {
        buttons(section, "Undo these changes")[0]?.click();
        await settle();
      });
      expect(root.querySelector("h1")?.textContent).toBe("Changes");
      const focused = document.activeElement;
      expect(focused).not.toBe(document.body);
      expect(focused?.textContent).toContain("README.md");
    });

    it("moves focus to the heading when the last row is gone", async () => {
      const fake = fakeSource({
        kind: "ready",
        changes: [{ path: agentPath, status: "modified", staged: false }],
      });
      fake.setTexts(agentPath, { before, after });
      const list = new ChangesList(fake.source);
      const root = render(<ChangesView list={list} />);
      await act(settle);
      const section = openItem(root, "triage");
      fake.answer({ kind: "ready", changes: [] });
      await act(async () => {
        buttons(section, "Undo these changes")[0]?.click();
        await settle();
      });
      expect(document.activeElement?.tagName).toBe("H1");
    });

    it("keeps the heading and the count when only files no kind places changed", async () => {
      const fake = fakeSource({
        kind: "ready",
        changes: [{ path: "README.md", status: "modified", staged: false }],
      });
      fake.setTexts("README.md", { before: "a\n", after: "b\n" });
      const root = render(<ChangesView list={new ChangesList(fake.source)} />);
      await act(settle);
      const headings = [...root.querySelectorAll("h2")].map((heading) => heading.textContent);
      expect(headings[0]).toContain("Since your last version");
      expect(headings[0]).toContain("1 item");
      expect(headings[1]).toBe("Other files");
    });

    it("leaves focus alone on a re-render while an item is open", async () => {
      const { root } = await openPage();
      openItem(root, "triage");
      await act(async () => {
        (document.activeElement as HTMLElement | null)?.blur();
      });
      await act(settle);
      expect(document.activeElement).toBe(document.body);
    });

    it("shows a file no kind places as one line without Undo this change", async () => {
      const { root } = await openPage();
      const section = openItem(root, "README.md");
      expect(section.textContent).toContain("Changed");
      expect(buttons(section, "Undo this change")).toHaveLength(0);
    });

    it("shows a file that can't be read as text as one line, New for an untracked one", async () => {
      const { root } = await openPage();
      const section = openItem(root, "new.txt");
      expect(section.textContent).toContain("New");
      expect(buttons(section, "Undo this change")).toHaveLength(0);
    });

    it("undoes one change at once, keeps the other, and offers Undo in a toast", async () => {
      const { fake, root, toasts } = await openPage();
      openItem(root, "triage");
      const [undoInstructions] = buttons(root, "Undo this change");
      await act(async () => {
        undoInstructions?.click();
        await settle();
      });
      expect(fake.replaced).toHaveLength(1);
      expect(fake.replaced[0]?.text).toBe(
        lines("id: triage", "name: Triage", "model: gpt", "instructions: Sort mail."),
      );
      expect(buttons(root, "Undo this change")).toHaveLength(1);
      const toast = toasts.list()[0];
      expect(toast?.title).toBe("Change undone");

      await act(async () => {
        toast?.action?.onClick();
        await settle();
      });
      expect(buttons(root, "Undo this change")).toHaveLength(2);
    });

    it("writes nothing and says why when the file changed since the page read it", async () => {
      const { fake, root } = await openPage();
      openItem(root, "triage");
      const [undoInstructions] = buttons(root, "Undo this change");
      fake.setTexts(agentPath, { before, after: `${after}# edited elsewhere\n` });
      await act(async () => {
        undoInstructions?.click();
        await settle();
      });
      expect(root.querySelector('[role="alert"]')?.textContent).toContain(
        "Couldn't undo this change.",
      );
      expect(fake.replaced[0]?.expected).toBe(after);
    });

    it("shows why the toast's Undo didn't work when the file changed in the meantime", async () => {
      const { fake, root, toasts } = await openPage();
      openItem(root, "triage");
      const [undoInstructions] = buttons(root, "Undo this change");
      await act(async () => {
        undoInstructions?.click();
        await settle();
      });
      const toast = toasts.list()[0];
      const changed = lines("id: triage", "name: Triage", "model: gpt", "instructions: Edited.");
      fake.setTexts(agentPath, { before, after: changed });
      await act(async () => {
        toast?.action?.onClick();
        await settle();
      });
      const failure = toasts.list().find((item) => item.title === "Couldn't put the change back");
      expect(failure?.tone).toBe("danger");
      expect(failure?.text).toContain("The file changed while you were looking");
    });

    it("reads the changed files' texts a few at a time", async () => {
      const paths = Array.from({ length: 10 }, (_, index) => `notes/${index}.txt`);
      const fake = fakeSource({
        kind: "ready",
        changes: paths.map((path) => ({ path, status: "modified" as const, staged: false })),
      });
      let running = 0;
      let most = 0;
      const list = new ChangesList({
        ...fake.source,
        readTexts: async () => {
          running += 1;
          most = Math.max(most, running);
          await settle();
          running -= 1;
          return { before: "a\n", after: "b\n" };
        },
      });
      await act(async () => {
        await settle();
        await settle();
        await settle();
        await settle();
      });
      expect(list.state.files).toHaveLength(10);
      expect(most).toBe(4);
    });

    it("makes Undo this change unavailable, with the reason on screen, while another change builds on it", () => {
      const file = {
        path: "workflows/alert.workflow.yaml",
        texts: undefined,
        description: {
          path: "workflows/alert.workflow.yaml",
          kind: "workflow" as const,
          described: true,
          lines: [
            { id: "step:page", sentence: "Step added: Page on-call", parts: [["states", "page"]] },
            {
              id: "step:notify",
              sentence: "Step changed: Notify",
              parts: [["states", "notify"]],
              needs: ["step:page"],
            },
          ],
        },
      };
      const list = new ChangesList(fakeSource({ kind: "ready", changes: [] }).source);
      const root = render(<ChangesPageOf list={list} files={[file]} />);
      openItem(root, "alert");
      const [first, second] = buttons(root, "Undo this change");
      expect(first?.getAttribute("aria-disabled")).toBe("true");
      expect(second?.getAttribute("aria-disabled")).toBeNull();
      expect(root.textContent).toContain("Step changed: Notify uses this. Undo that change first.");
    });
  });
});
