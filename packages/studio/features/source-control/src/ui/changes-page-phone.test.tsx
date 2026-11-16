// @vitest-environment jsdom
import { PresentationProvider } from "@halonicjs/studio-kit";
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

async function openPhonePage(fake: ReturnType<typeof fakeSource>) {
  const root = render(
    <PresentationProvider presentation="phone">
      <ChangesView list={new ChangesList(fake.source)} />
    </PresentationProvider>,
  );
  await act(settle);
  return root;
}

function changedModels() {
  const fake = fakeSource({
    kind: "ready",
    changes: [{ path: "models.yaml", status: "modified", staged: false }],
  });
  fake.setTexts("models.yaml", { before: "a: 1\n", after: "a: 2\n" });
  return fake;
}

function createVersionButton(root: HTMLElement): HTMLButtonElement | undefined {
  return [...root.querySelectorAll("button")].find(
    (element) => element.textContent?.trim() === "Create version",
  );
}

verifies("source-control.changes-phone", () => {
  describe("ChangesView on a phone", () => {
    it("leaves the heading to screen readers and keeps a 16px inset", async () => {
      const root = await openPhonePage(changedModels());
      const heading = root.querySelector("h1");
      expect(heading?.textContent).toBe("Changes");
      expect(heading?.className).toContain("sr-only");
      expect(root.firstElementChild?.className).toContain("p-4");
    });

    it("draws Create version as a full-width button that opens the form sheet", async () => {
      const root = await openPhonePage(changedModels());
      const create = createVersionButton(root);
      expect(create?.className).toContain("w-full");
      expect(create?.className).toContain("min-h-touch");
      act(() => create?.click());
      expect(document.querySelector("dialog")?.textContent).toContain("Notes");
    });

    it("has no Create version when nothing changed", async () => {
      const root = await openPhonePage(fakeSource({ kind: "ready", changes: [] }));
      expect(root.textContent).toContain("Nothing has changed since your last version.");
      expect(createVersionButton(root)).toBeUndefined();
    });

    it("says git is on the computer when git is missing", async () => {
      const root = await openPhonePage(fakeSource({ kind: "no-git" }));
      expect(root.textContent).toContain("Halonic needs git on your computer to keep versions.");
    });

    it("says Halonic on the computer isn't answering when git doesn't answer", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      fake.failReads(new Error("boom"));
      const root = await openPhonePage(fake);
      expect(root.textContent).toContain("Couldn't load changes");
      expect(root.textContent).toContain("Halonic on your computer isn't answering.");
      expect(root.textContent).toContain("Try again");
    });
  });
});
