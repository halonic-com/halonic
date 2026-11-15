// @vitest-environment jsdom
import { OpenExternalProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChangesList } from "../changes-list.ts";
import { fakeSource, settle } from "../source.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ChangesView } from "./changes-page.tsx";

afterEach(unmountAll);

async function openPage(fake: ReturnType<typeof fakeSource>) {
  const list = new ChangesList(fake.source);
  const openExternal = vi.fn();
  const root = render(
    <OpenExternalProvider openExternal={openExternal}>
      <ChangesView list={list} />
    </OpenExternalProvider>,
  );
  await act(settle);
  return { root, list, openExternal };
}

function button(root: HTMLElement, name: string): HTMLElement {
  const found = [...root.querySelectorAll<HTMLElement>("button")].find(
    (element) => element.textContent?.trim() === name,
  );
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

verifies("source-control.changes-page", () => {
  describe("ChangesView", () => {
    it("shows nothing for 300 ms, then skeleton rows labelled Loading changes, until the first read answers", () => {
      vi.useFakeTimers();
      try {
        const fake = fakeSource({ kind: "ready", changes: [] });
        const root = render(<ChangesView list={new ChangesList(fake.source)} />);
        expect(root.querySelector("h1")?.textContent).toBe("Changes");
        expect(root.textContent).not.toContain("Loading changes");
        act(() => vi.advanceTimersByTime(300));
        expect(root.textContent).toContain("Loading changes");
      } finally {
        vi.useRealTimers();
      }
    });

    it("says Nothing has changed for a repository with no changed file", async () => {
      const { root } = await openPage(fakeSource({ kind: "ready", changes: [] }));
      expect(root.textContent).toContain("Nothing has changed since your last version.");
    });

    it("counts the changed files until the items are listed", async () => {
      const { root } = await openPage(
        fakeSource({
          kind: "ready",
          changes: [{ path: "models.yaml", status: "modified", staged: false }],
        }),
      );
      expect(root.textContent).toContain("1 file changed since your last version.");
    });

    it("offers Turn on history for a folder without git history, and then shows the page", async () => {
      const fake = fakeSource({ kind: "not-a-repository" });
      const { root } = await openPage(fake);
      expect(root.textContent).toContain("Keep a history of your work");
      await act(async () => {
        button(root, "Turn on history").click();
        await settle();
      });
      expect(fake.turnedOn()).toBe(1);
      expect(root.textContent).toContain("Nothing has changed since your last version.");
    });

    it("says why turning history on failed and keeps the button", async () => {
      const fake = fakeSource({ kind: "not-a-repository" });
      fake.failTurnOn(new Error("boom"));
      const { root } = await openPage(fake);
      await act(async () => {
        button(root, "Turn on history").click();
        await settle();
      });
      expect(root.querySelector('[role="alert"]')?.textContent).toContain(
        "Couldn't turn on history.",
      );
      expect(button(root, "Turn on history")).toBeTruthy();
    });

    it("says Halonic needs git, with a way to get it and Check again", async () => {
      const fake = fakeSource({ kind: "no-git" });
      const { root, openExternal } = await openPage(fake);
      expect(root.textContent).toContain("Halonic needs git to keep versions.");
      expect(root.textContent).toContain("How to install git");

      fake.answer({ kind: "ready", changes: [] });
      await act(async () => {
        button(root, "Check again").click();
        await settle();
      });
      expect(root.textContent).toContain("Nothing has changed since your last version.");
      expect(openExternal).not.toHaveBeenCalled();
    });

    it("says Couldn't load changes with Try again when the first read fails", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      fake.failReads(new Error("git died"));
      const { root } = await openPage(fake);
      expect(root.textContent).toContain("Couldn't load changes");
      expect(root.textContent).toContain("Git didn't answer. Try again in a moment.");

      fake.failReads(undefined);
      await act(async () => {
        button(root, "Try again").click();
        await settle();
      });
      expect(root.textContent).toContain("Nothing has changed since your last version.");
    });

    it("keeps the page when a later read fails", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      const { root, list } = await openPage(fake);
      fake.failReads(new Error("git died"));
      await act(() => list.refresh());
      expect(root.textContent).toContain("Nothing has changed since your last version.");
      expect(root.textContent).not.toContain("Couldn't load changes");
    });
  });
});
