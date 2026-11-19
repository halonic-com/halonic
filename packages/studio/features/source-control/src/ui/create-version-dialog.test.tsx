// @vitest-environment jsdom
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Version } from "../api.ts";
import { ChangesList } from "../changes-list.ts";
import { fakeSource, settle } from "../source.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ChangesView } from "./changes-page.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const lines = (...all: string[]) => `${all.join("\n")}\n`;
const agentPath = "agents/triage.agent.yaml";
const before = lines("id: triage", "name: Triage", "model: claude", "instructions: Sort mail.");
const after = lines("id: triage", "name: Triage", "model: gpt", "instructions: Sort all mail.");

const earlier: Version = {
  id: "a1",
  name: "Earlier",
  notes: "",
  author: "Ana",
  at: Date.now(),
  files: [],
};

/** The version a test makes, as History reads it back. */
const made: Version = { ...earlier, id: "b2", name: "First reply flow" };

/** The focusable cell of a version's row in History. */
const historyCell = (id: string) =>
  document.querySelector(`[data-part="history-list"] [data-row-id="${id}"] [role="gridcell"]`);

/** The page with two changed files and one earlier version, unless it is the first version. */
async function openPage({ first = false }: { readonly first?: boolean } = {}) {
  const fake = fakeSource({
    kind: "ready",
    changes: [
      { path: agentPath, status: "modified", staged: false },
      { path: "README.md", status: "modified", staged: false },
    ],
  });
  if (!first) fake.setHistory([earlier]);
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
  return { fake, list, root, toasts };
}

/** A button of the page, or of the dialog when it is open (the dialog's own Create version). */
function button(name: string): HTMLButtonElement {
  const scope = document.querySelector("dialog") ?? document;
  const found = [...scope.querySelectorAll("button")].find((element) =>
    element.textContent?.trim().startsWith(name),
  );
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

const dialog = () => document.querySelector("dialog");
const nameField = () => document.querySelector<HTMLInputElement>("dialog input");
const notesField = () => document.querySelector<HTMLTextAreaElement>("dialog textarea");

async function type(field: HTMLInputElement | HTMLTextAreaElement | null, text: string) {
  const prototype = field instanceof HTMLInputElement ? HTMLInputElement : HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype.prototype, "value")?.set?.call(field, text);
    field?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function press(field: HTMLElement | null, init: KeyboardEventInit) {
  await act(async () => {
    field?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
    );
    await settle();
  });
}

async function openDialog(options?: { readonly first?: boolean }) {
  const page = await openPage(options);
  await act(async () =>
    [...document.querySelectorAll("button")]
      .find((element) => element.textContent?.trim() === "Create version")
      ?.click(),
  );
  return page;
}

verifies("source-control.create-version", () => {
  describe("Create version", () => {
    it("opens with the offered name selected and everything that changed in it", async () => {
      await openDialog();
      expect(nameField()?.value).toBe("Changes to Triage and README.md");
      expect(nameField()?.selectionStart).toBe(0);
      expect(nameField()?.selectionEnd).toBe(nameField()?.value.length);
      const contents = dialog()?.querySelector("section")?.textContent ?? "";
      expect(contents).toContain("Triage");
      expect(contents).toContain("README.md");
      expect(contents).not.toContain(agentPath);
      expect(dialog()?.textContent).not.toContain("Save first");
    });

    it("lists Important changes first, marked and as before → after", async () => {
      await openDialog();
      const items = [
        ...(dialog()?.querySelectorAll("section > ul > li:first-child > ul > li") ?? []),
      ];
      expect(items[0]?.textContent).toContain("Instructions");
      expect(items[1]?.textContent).toContain("Model: claude → gpt");
      const first = items[0];
      const [was, is] = first?.querySelectorAll("pre") ?? [];
      expect(was?.textContent).toBe("Sort mail.");
      expect(is?.textContent).toBe("Sort all mail.");
      // The part's name is visible over its pair, not only spoken.
      const label = first?.querySelector("span.text-label:not(.text-fg-muted)");
      expect(label?.textContent).toBe("Instructions");
      expect(first?.querySelector(".sr-only")).toBeNull();
      // The old value is struck through in fg-muted.
      expect(was?.className).toContain("line-through");
      expect(was?.className).toContain("text-fg-muted");
      expect(is?.className).not.toContain("line-through");
    });

    it("puts the item with an Important setting first, its chip at the right of the row", async () => {
      const fake = fakeSource({
        kind: "ready",
        changes: [
          { path: "README.md", status: "modified", staged: false },
          { path: agentPath, status: "modified", staged: false },
        ],
      });
      fake.setTexts(agentPath, { before, after });
      fake.setTexts("README.md", { before: "a\n", after: "b\n" });
      const list = new ChangesList(fake.source);
      render(<ChangesView list={list} />);
      await act(settle);
      await act(async () => list.startVersion());
      const rows = [...(dialog()?.querySelectorAll("section > ul > li") ?? [])];
      expect(rows[0]?.textContent).toContain("Triage");
      expect(rows[0]?.querySelector("div > span.rounded-full")?.textContent).toBe("Important");
      expect(rows[1]?.querySelector("span.rounded-full")).toBeNull();
    });

    it("names each item with its icon and kind as the list does, so two of one name differ", async () => {
      const testPath = "workflows/triage.test.yaml";
      const fake = fakeSource({
        kind: "ready",
        changes: [
          { path: agentPath, status: "modified", staged: false },
          { path: testPath, status: "untracked", staged: false },
        ],
      });
      fake.setTexts(agentPath, { before, after });
      fake.setTexts(testPath, { before: null, after: "workflow: triage\ncases: []\n" });
      const list = new ChangesList(fake.source);
      render(<ChangesView list={list} />);
      await act(settle);
      await act(async () => list.startVersion());
      const labels = [...(dialog()?.querySelectorAll("section label") ?? [])].map((label) => ({
        text: label.textContent,
        icon: label.querySelector("svg[data-place-icon]")?.getAttribute("data-place-icon"),
      }));
      expect(labels).toEqual([
        { text: "TriageAgent", icon: "agents" },
        { text: "TriageWorkflow test", icon: "workflows" },
      ]);
      expect(dialog()?.textContent).not.toContain("triage.test");
    });

    it("has a ticked checkbox on each item, and creates only the ticked ones", async () => {
      const { fake } = await openDialog();
      const boxes = [
        ...(dialog()?.querySelectorAll<HTMLInputElement>("input[type=checkbox]") ?? []),
      ];
      expect(boxes).toHaveLength(2);
      expect(boxes.every((box) => box.checked)).toBe(true);
      await act(async () => boxes[0]?.click());
      expect(boxes[0]?.checked).toBe(false);
      await act(async () => {
        button("Create version").click();
        await settle();
      });
      expect(fake.versions).toHaveLength(1);
      expect(fake.versions[0]?.paths).toEqual(["README.md"]);
    });

    it("builds the offered name from the ticked items until the name is edited", async () => {
      await openDialog();
      const boxes = () => [
        ...(dialog()?.querySelectorAll<HTMLInputElement>("input[type=checkbox]") ?? []),
      ];
      await act(async () => boxes()[0]?.click());
      expect(nameField()?.value).toBe("Changes to README.md");
      await type(nameField(), "My own");
      await act(async () => boxes()[0]?.click());
      expect(nameField()?.value).toBe("My own");
    });

    it("offers First version while the workspace has no version", async () => {
      await openDialog({ first: true });
      expect(nameField()?.value).toBe("First version");
    });

    it("counts the items the page counts, however many files they hold", async () => {
      const fake = fakeSource({
        kind: "ready",
        changes: ["a", "b", "c"].flatMap((name) => [
          { path: `agents/${name}.agent.yaml`, status: "added" as const, staged: false },
          { path: `agents/${name}.md`, status: "added" as const, staged: false },
        ]),
      });
      fake.setHistory([earlier]);
      const list = new ChangesList(fake.source);
      render(<ChangesView list={list} />);
      await act(settle);
      await act(async () => list.startVersion());
      const rows = dialog()?.querySelectorAll("section > ul > li") ?? [];
      expect(nameField()?.value).toBe(`Changes to ${rows.length} items`);
    });

    it("says Halonic made .gitignore in the first version, by a name and not a path", async () => {
      const fake = fakeSource({
        kind: "ready",
        changes: [{ path: ".gitignore", status: "added", staged: false }],
      });
      const list = new ChangesList(fake.source);
      render(<ChangesView list={list} />);
      await act(settle);
      await act(async () => list.startVersion());
      const contents = dialog()?.querySelector("section")?.textContent ?? "";
      expect(contents).toContain("Files history leaves out");
      expect(contents).toContain("Halonic added this when you turned on history.");
      expect(contents).not.toContain(".gitignore");
    });

    it("gives the count beside the heading a word", async () => {
      await openPage();
      expect(document.body.textContent).toContain("2 items");
    });

    it("opens with one item when a screen asks for it", async () => {
      const { list } = await openPage();
      await act(async () => list.startVersion([agentPath]));
      expect(nameField()?.value).toBe("Changes to Triage");
      expect(dialog()?.querySelector("section")?.textContent).not.toContain("README.md");
    });

    it("says what is missing, focuses Name, and records nothing for an empty name", async () => {
      const { fake } = await openDialog();
      await type(nameField(), "");
      await act(async () => button("Create version").click());
      expect(dialog()?.textContent).toContain("Give this version a name.");
      expect(document.activeElement).toBe(nameField());
      expect(nameField()?.getAttribute("aria-invalid")).toBe("true");
      expect(fake.versions).toEqual([]);
    });

    it("creates from Ctrl Enter in Name and in Notes, and Enter in Notes adds a line", async () => {
      const { fake } = await openDialog();
      await type(nameField(), "First reply flow");
      await type(notesField(), "Tone changed.");
      await press(notesField(), { key: "Enter" });
      expect(fake.versions).toEqual([]);
      await press(notesField(), { key: "Enter", ctrlKey: true });
      expect(fake.versions).toHaveLength(1);
      expect(fake.versions[0]?.message).toBe("First reply flow\n\nTone changed.");
      expect(dialog()).toBeNull();
    });

    it("creates from Ctrl Enter in Name", async () => {
      const { fake } = await openDialog();
      await type(nameField(), "Quick one");
      await press(nameField(), { key: "Enter", ctrlKey: true });
      expect(fake.versions[0]?.message).toBe("Quick one");
    });

    it("shows the toast, closes, empties the list and moves focus to the new version", async () => {
      const { fake, toasts, root } = await openDialog();
      fake.setHistory([made, earlier]);
      await type(nameField(), "First reply flow");
      await act(async () => {
        button("Create version").click();
        await settle();
      });
      expect(dialog()).toBeNull();
      expect(toasts.list()[0]?.title).toBe('Created version "First reply flow"');
      expect(root.textContent).toContain("Nothing has changed since your last version.");
      expect(document.activeElement).toBe(historyCell("b2"));
    });

    it("moves focus from the button that opened it to the new version's row (C1)", async () => {
      const { fake } = await openPage();
      fake.setHistory([made, earlier]);
      const opener = button("Create version");
      opener.focus();
      await act(async () => opener.click());
      await act(async () => {
        button("Create version").click();
        await settle();
      });
      // Every change is in the version, so the button that opened the dialog is gone.
      expect(opener.isConnected).toBe(false);
      expect(document.activeElement).toBe(historyCell("b2"));
    });

    it("moves focus to the new version's row even when changes are left", async () => {
      const { fake } = await openPage();
      fake.setHistory([made, earlier]);
      const opener = button("Create version");
      opener.focus();
      await act(async () => opener.click());
      const boxes = dialog()?.querySelectorAll<HTMLInputElement>("input[type=checkbox]");
      await act(async () => boxes?.[0]?.click());
      await act(async () => {
        button("Create version").click();
        await settle();
      });
      expect(button("Create version").isConnected).toBe(true);
      expect(document.activeElement).toBe(historyCell("b2"));
    });

    it("leaves focus on the button when History can't be read after the version", async () => {
      const { fake } = await openPage();
      const opener = button("Create version");
      opener.focus();
      await act(async () => opener.click());
      fake.failHistory(new Error("boom"));
      const boxes = dialog()?.querySelectorAll<HTMLInputElement>("input[type=checkbox]");
      await act(async () => boxes?.[0]?.click());
      await act(async () => {
        button("Create version").click();
        await settle();
      });
      expect(document.activeElement).toBe(opener);
    });

    it("stays open with git's reason and keeps the name and notes when git refuses", async () => {
      const { fake } = await openDialog();
      fake.failVersion(new Error("boom"));
      await type(nameField(), "First reply flow");
      await type(notesField(), "Tone changed.");
      await act(async () => {
        button("Create version").click();
        await settle();
      });
      // The dialog reads a failure a frame after the request ends.
      await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      expect(dialog()?.textContent).toContain("Couldn't create the version.");
      expect(nameField()?.value).toBe("First reply flow");
      expect(notesField()?.value).toBe("Tone changed.");
      expect(button("Try again")).toBeDefined();
    });

    it("closes with Cancel, changes nothing and gives focus back to Create version", async () => {
      const { fake } = await openPage();
      const opener = button("Create version");
      opener.focus();
      await act(async () => opener.click());
      await act(async () => button("Cancel").click());
      expect(dialog()).toBeNull();
      expect(fake.versions).toEqual([]);
      expect(document.activeElement).toBe(opener);
    });
  });
});
