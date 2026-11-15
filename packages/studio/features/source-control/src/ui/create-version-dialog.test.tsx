// @vitest-environment jsdom
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

async function openPage() {
  const fake = fakeSource({
    kind: "ready",
    changes: [
      { path: agentPath, status: "modified", staged: false },
      { path: "README.md", status: "modified", staged: false },
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

async function openDialog() {
  const page = await openPage();
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
      expect(nameField()?.value).toBe("Changes to triage and README");
      expect(nameField()?.selectionStart).toBe(0);
      expect(nameField()?.selectionEnd).toBe(nameField()?.value.length);
      const contents = dialog()?.querySelector("section")?.textContent ?? "";
      expect(contents).toContain(agentPath);
      expect(contents).toContain("README.md");
      expect(dialog()?.textContent).not.toContain("Save first");
    });

    it("lists Important changes first, marked and as before → after", async () => {
      await openDialog();
      const items = [
        ...(dialog()?.querySelectorAll("section > ul > li:first-child > ul > li") ?? []),
      ];
      expect(items[0]?.textContent).toContain("Important");
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
    });

    it("opens with one item when a screen asks for it", async () => {
      const { list } = await openPage();
      await act(async () => list.startVersion([agentPath]));
      expect(nameField()?.value).toBe("Changes to triage");
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

    it("shows the toast, closes, empties the list and moves focus to the heading", async () => {
      const { toasts, root } = await openDialog();
      await type(nameField(), "First reply flow");
      await act(async () => {
        button("Create version").click();
        await settle();
      });
      expect(dialog()).toBeNull();
      expect(toasts.list()[0]?.title).toBe('Created version "First reply flow"');
      expect(root.textContent).toContain("Nothing has changed since your last version.");
      expect(document.activeElement).toBe(root.querySelector("h1"));
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

    it("closes with Cancel and changes nothing", async () => {
      const { fake } = await openDialog();
      await act(async () => button("Cancel").click());
      expect(dialog()).toBeNull();
      expect(fake.versions).toEqual([]);
    });
  });
});
