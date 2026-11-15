// @vitest-environment jsdom
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ChangesList } from "../changes-list.ts";
import { fakeSource, settle } from "../source.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ChangeList } from "./change-list.tsx";
import { ChangesView } from "./changes-page.tsx";

afterEach(unmountAll);

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
      const section = root.querySelector(`section[aria-label="${agentPath}"]`);
      expect(section?.querySelector("h3")?.textContent).toBe("Important");
      const rows = [...(section?.querySelectorAll("li") ?? [])].map((row) => row.textContent);
      expect(rows[0]).toContain("Instructions");
      expect(rows[1]).toContain("Model");
      expect(section?.querySelectorAll("button")).toHaveLength(2);
    });

    it("shows a file no kind places as one line without Undo this change", async () => {
      const { root } = await openPage();
      const section = root.querySelector('section[aria-label="README.md"]');
      expect(section?.textContent).toContain("Changed");
      expect(section?.querySelector("button")).toBeNull();
    });

    it("shows a file that can't be read as text as one line, New for an untracked one", async () => {
      const { root } = await openPage();
      const section = root.querySelector('section[aria-label="notes/new.txt"]');
      expect(section?.textContent).toContain("New");
      expect(section?.querySelector("button")).toBeNull();
    });

    it("undoes one change at once, keeps the other, and offers Undo in a toast", async () => {
      const { fake, root, toasts } = await openPage();
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
      const root = render(<ChangeList list={list} files={[file]} />);
      const [first, second] = buttons(root, "Undo this change");
      expect(first?.getAttribute("aria-disabled")).toBe("true");
      expect(second?.getAttribute("aria-disabled")).toBeNull();
      expect(root.textContent).toContain("Step changed: Notify uses this. Undo that change first.");
    });
  });
});
