// @vitest-environment jsdom
import { createToastStore, PresentationProvider, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { ChangesSource, Version } from "../api.ts";
import { ChangesList } from "../changes-list.ts";
import { fakeSource, settle } from "../source.test-helper.ts";
import { buttonsNamed } from "../test-support/buttons.ts";
import { PhoneStack, topBarTitle } from "../test-support/phone-stack.tsx";
import { render, unmountAll } from "../test-support/render.tsx";
import { ChangesView } from "./changes-page.tsx";

afterEach(unmountAll);

const sorter = "agents/sorter.agent.yaml";
const version = (id: string, name: string): Version => ({
  id: id.repeat(40),
  name,
  notes: "",
  author: "Sam Lee",
  at: Date.now() - 60_000,
  files: [sorter],
});
const dutch = version("d", "Sorter replies in Dutch");
const newer = version("e", "Sorter uses a smaller model");

/** A workspace whose Sorter changed since "Sorter replies in Dutch", in a newer version. */
function changedSorter() {
  const fake = fakeSource({ kind: "ready", changes: [] });
  fake.setHistory([newer, dutch]);
  fake.setTexts(sorter, { before: "model: b\n", after: "model: b\n" });
  fake.setAtVersion(dutch.id, sorter, "model: a\n");
  return fake;
}

/** The Changes page with a version's row clicked: on a phone, its page pushed on the stack. */
async function show(source: ChangesSource, phone = false) {
  const toasts = createToastStore();
  const list = new ChangesList(source);
  const view: ReactNode = phone ? (
    <PresentationProvider presentation="phone">
      <PhoneStack>{(pages) => <ChangesView list={list} phonePages={pages} />}</PhoneStack>
    </PresentationProvider>
  ) : (
    <ChangesView list={list} />
  );
  const root = render(<ToastStoreProvider store={toasts}>{view}</ToastStoreProvider>);
  await act(settle);
  const row = [...root.querySelectorAll<HTMLElement>('[role="gridcell"]')].find((cell) =>
    cell.textContent?.includes(dutch.name),
  );
  await act(async () => row?.click());
  return { root, toasts };
}

const goBackButton = (root: HTMLElement) => buttonsNamed(root, "Go back to this version")[0];
const sharedLine =
  "Your team keeps the versions you shared after this one. Going back makes a new change you can share.";

/** The text Go back is described by, as a screen reader reads it after the label. */
function described(root: HTMLElement): string | null | undefined {
  const id = goBackButton(root)?.getAttribute("aria-describedby") ?? "";
  return document.getElementById(id)?.textContent;
}

async function goBack(root: HTMLElement) {
  await act(async () => {
    goBackButton(root)?.click();
    await settle();
  });
}

verifies("source-control.history-go-back", () => {
  describe("Go back to this version", () => {
    it("goes back at once, with a toast whose Undo puts the newer files back", async () => {
      const fake = changedSorter();
      const { root, toasts } = await show(fake.source);
      await goBack(root);
      expect(await fake.source.readFile(sorter)).toBe("model: a\n");
      const [toast] = toasts.list();
      expect(toast?.title).toBe('Went back to "Sorter replies in Dutch".');
      expect(toast?.action?.label).toBe("Undo");
      await act(async () => {
        toast?.action?.onClick();
        await settle();
      });
      expect(await fake.source.readFile(sorter)).toBe("model: b\n");
    });

    it("shows a danger toast and changes nothing when a file changed meanwhile", async () => {
      const fake = changedSorter();
      const source: ChangesSource = { ...fake.source, replaceFile: async () => "changed-on-disk" };
      const { root, toasts } = await show(source);
      await goBack(root);
      expect(await fake.source.readFile(sorter)).toBe("model: b\n");
      expect(toasts.list()[0]?.tone).toBe("danger");
      expect(toasts.list()[0]?.title).toBe('Couldn\'t go back to "Sorter replies in Dutch"');
    });

    it("shows the warning Callout, with focus, when putting the files back fails too", async () => {
      const triage = "agents/triage.agent.yaml";
      const fake = changedSorter();
      fake.setTexts(triage, { before: "model: t\n", after: "model: t\n" });
      // Triage changed on disk, and Sorter can't be put back either.
      const source: ChangesSource = {
        ...fake.source,
        removeFile: async () => "changed-on-disk",
        replaceFile: async (path, text, expected) =>
          text === "model: b\n" ? "changed-on-disk" : fake.source.replaceFile(path, text, expected),
      };
      const { root, toasts } = await show(source);
      await goBack(root);
      const callout = root.querySelector<HTMLElement>('[role="group"]');
      expect(document.activeElement).toBe(callout);
      expect(callout?.textContent).toContain('Went back only partly to "Sorter replies in Dutch".');
      expect(callout?.textContent).toContain(sorter);
      expect(callout?.textContent).toContain("Try again");
      expect(toasts.list()).toEqual([]);
    });

    it("says the team keeps the versions shared after this one, as Go back's description", async () => {
      const fake = changedSorter();
      fake.setRemote(true);
      const { root } = await show(fake.source);
      expect(root.textContent).toContain(sharedLine);
      expect(described(root)).toBe(sharedLine);
      expect(goBackButton(root)?.hasAttribute("aria-disabled")).toBe(false);
    });

    it("says nothing of sharing when the newer versions aren't shared yet", async () => {
      const fake = changedSorter();
      fake.setRemote(true);
      fake.setUnshared(1, [newer.id]);
      const { root } = await show(fake.source);
      expect(root.textContent).not.toContain("Your team keeps");
      expect(goBackButton(root)?.hasAttribute("aria-describedby")).toBe(false);
    });

    it("waits while a merge of updates is started", async () => {
      const fake = changedSorter();
      fake.setMerge({ items: [], versions: 1, people: ["Sam"] });
      const { root } = await show(fake.source);
      const button = goBackButton(root);
      expect(button?.getAttribute("aria-disabled")).toBe("true");
      expect(described(root)).toBe("Finish getting updates first.");
      await goBack(root);
      expect(fake.replaced).toEqual([]);
    });

    it("sits in the bottom bar of the version page on a phone", async () => {
      const fake = changedSorter();
      fake.setRemote(true);
      const { root } = await show(fake.source, true);
      const button = goBackButton(root);
      expect(button).toBeDefined();
      expect(topBarTitle(root)).toBe(dutch.name);
      expect(root.querySelector("h1")?.textContent).toBe(dutch.name);
      expect(described(root)).toBe(sharedLine);
      await goBack(root);
      expect(await fake.source.readFile(sorter)).toBe("model: a\n");
    });
  });
});
