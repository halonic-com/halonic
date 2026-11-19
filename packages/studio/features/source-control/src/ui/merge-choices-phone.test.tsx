// @vitest-environment jsdom
import { createToastStore, PresentationProvider, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { UpdateItem, UpdateMerge } from "../api.ts";
import { ChangesList } from "../changes-list.ts";
import { fakeSource, settle } from "../source.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ChangesView } from "./changes-page.tsx";

afterEach(unmountAll);

const item = (path: string, mine: string | null, theirs: string | null): UpdateItem => ({
  path,
  mine,
  theirs,
  choice: undefined,
  copy: undefined,
});

const merge = (items: readonly UpdateItem[]): UpdateMerge => ({
  items,
  versions: 2,
  people: ["Sam"],
});

/** The Changes page on a phone, with a Get updates that starts choosing two items. */
async function openPhonePage() {
  const fake = fakeSource({
    kind: "ready",
    changes: [{ path: "x.md", status: "modified", staged: false }],
  });
  fake.setTexts("x.md", { before: "a\n", after: "b\n" });
  fake.setRemote(true);
  fake.setUpdates({ kind: "both-moved" });
  fake.setMergeStart({
    kind: "started",
    merge: merge([item("a.md", "mine\n", "sam\n"), item("b.md", "m\n", "s\n")]),
  });
  const root = render(
    <ToastStoreProvider store={createToastStore()}>
      <PresentationProvider presentation="phone">
        <ChangesView list={new ChangesList(fake.source)} />
      </PresentationProvider>
    </ToastStoreProvider>,
  );
  await act(settle);
  return { fake, root };
}

/** A button by its label; Get updates also holds its hidden busy label, so it matches by start. */
const button = (label: string) =>
  [...document.querySelectorAll("button")].find((b) => {
    const text = b.textContent?.trim() ?? "";
    return label === "Get updates" ? text.startsWith(label) : text === label;
  });
const press = (label: string) =>
  act(async () => {
    button(label)?.click();
    await settle();
  });

verifies("source-control.changes-phone", () => {
  describe("Get updates on a phone", () => {
    it("opens the choices as their own page, with the tiles stacked and Yours first", async () => {
      const { root } = await openPhonePage();
      await press("Get updates");
      const title = root.querySelector("h1");
      expect(title?.textContent).toBe("Getting updates");
      expect(document.activeElement).toBe(title);
      expect(button("Back to Changes")).toBeDefined();
      expect(root.textContent).not.toContain("Since your last version");
      const tiles = root.querySelector("li section > div.flex-col.gap-4");
      expect(tiles).not.toBeNull();
      expect(tiles?.firstElementChild?.textContent).toContain("Yours");
    });

    it("keeps one heading level under the next: the page, each item, each tile", async () => {
      const { root } = await openPhonePage();
      await press("Get updates");
      expect(root.querySelectorAll("h1")).toHaveLength(1);
      expect([...root.querySelectorAll("h2")].map((h) => h.textContent)).toEqual(["a.md", "b.md"]);
      expect(root.querySelectorAll("h3").length).toBeGreaterThan(0);
      expect(root.querySelector("h4")).toBeNull();
    });

    it("puts how many are left, Finish and Cancel in the bottom bar", async () => {
      const { root } = await openPhonePage();
      await press("Get updates");
      const bar = root.querySelector(".action-bar");
      expect(bar?.textContent).toContain("Choose for 2 more items.");
      const finish = button("Finish getting updates");
      expect(bar?.contains(finish ?? null)).toBe(true);
      expect(bar?.contains(button("Cancel getting updates") ?? null)).toBe(true);
      expect(finish?.getAttribute("aria-disabled")).toBe("true");
      const reason = document.getElementById(finish?.getAttribute("aria-describedby") ?? "");
      expect(reason?.textContent).toBe("Choose for 2 more items.");
    });

    it("keeps the merge started on Back, and Continue brings the choices back as they were", async () => {
      const { fake, root } = await openPhonePage();
      await press("Get updates");
      await act(async () => {
        root.querySelector<HTMLButtonElement>("li button")?.click();
        await settle();
      });
      expect(fake.mergeCalls).toContain("choose a.md mine Sam's");
      await press("Back to Changes");
      expect(fake.mergeCalls).not.toContain("cancel");
      expect(root.textContent).toContain("You're in the middle of getting Sam's updates.");
      expect(document.activeElement?.textContent).toBe("Changes");
      await press("Continue");
      expect(root.textContent).toContain("Keeping yours");
      expect(root.textContent).toContain("Choose for 1 more item.");
    });

    it("puts why Get updates waits on its own line under the button", async () => {
      const { root } = await openPhonePage();
      await press("Get updates");
      await press("Back to Changes");
      const reason = [...root.querySelectorAll("span")].find(
        (span) => span.textContent === "Finish getting updates first.",
      );
      const column = reason?.parentElement;
      expect(column?.className).toContain("flex-col");
      expect(column?.className).toContain("items-start");
      expect(column?.firstElementChild).toBe(button("Get updates"));
    });
  });
});
