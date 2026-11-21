// @vitest-environment jsdom
import { KindedError } from "@halonicjs/std";
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
    (element) => element.textContent?.trim().startsWith(name) === true,
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

    it("lists the changed item by its name, not its path, once the read answers", async () => {
      const fake = fakeSource({
        kind: "ready",
        changes: [{ path: "models.yaml", status: "modified", staged: false }],
      });
      fake.setTexts("models.yaml", { before: "a: 1\n", after: "a: 2\n" });
      const { root } = await openPage(fake);
      expect(root.textContent).toContain("Models");
      expect(root.textContent).not.toContain("models.yaml");
      expect(root.textContent).not.toContain("Nothing has changed");
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

    it("shows git's own reason when the first read fails with one", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      fake.failReads(new KindedError("unavailable", "fatal: detected dubious ownership"));
      const { root } = await openPage(fake);
      expect(root.textContent).toContain("Detected dubious ownership.");
      expect(root.textContent).not.toContain("fatal:");
      expect(root.textContent).not.toContain("Git didn't answer");
    });

    it("shows the reason turning history on failed", async () => {
      const fake = fakeSource({ kind: "not-a-repository" });
      fake.failTurnOn(
        new KindedError("conflict", ".gitignore changed while Halonic was changing it."),
      );
      const { root } = await openPage(fake);
      await act(async () => {
        button(root, "Turn on history").click();
        await settle();
      });
      expect(root.querySelector('[role="alert"]')?.textContent).toContain(
        ".gitignore changed while Halonic was changing it.",
      );
    });

    it("keeps the page and says Couldn't load changes with Try again when a later read fails", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      const { root, list } = await openPage(fake);
      fake.failReads(new KindedError("unavailable", "error: not a git repository"));
      await act(() => list.refresh());
      expect(root.textContent).toContain("Nothing has changed since your last version.");
      expect(root.textContent).toContain("Couldn't load changes");
      expect(root.textContent).toContain("Not a git repository.");

      fake.failReads(undefined);
      await act(async () => {
        button(root, "Try again").click();
        await settle();
      });
      expect(root.textContent).not.toContain("Couldn't load changes");
      expect(root.textContent).toContain("Nothing has changed since your last version.");
      expect(document.activeElement).toBe(root.querySelector("h1"));
    });

    it("announces a later failure as an alert", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      const { root, list } = await openPage(fake);
      expect(root.querySelector('[role="alert"]')).toBeNull();
      fake.failReads(new KindedError("unavailable", "error: not a git repository"));
      await act(() => list.refresh());
      expect(root.querySelector('[role="alert"]')?.textContent).toContain("Couldn't load changes");
    });

    it("says Checking… while Check again reads, and Still can't find git when git is still missing", async () => {
      const fake = fakeSource({ kind: "no-git" });
      let release: () => void = () => {};
      const { root } = await openPage({
        ...fake,
        source: {
          ...fake.source,
          read: async () => {
            await new Promise<void>((resolve) => {
              release = resolve;
            });
            return { kind: "no-git" };
          },
        },
      });
      await act(async () => release());
      const check = button(root, "Check again");
      await act(async () => check.click());
      expect(check.getAttribute("aria-busy")).toBe("true");
      expect(check.textContent).toContain("Checking…");
      await act(async () => release());
      expect(check.getAttribute("aria-busy")).not.toBe("true");
      expect(root.querySelector('[role="status"]')?.textContent).toBe("Still can't find git.");
    });

    it("says Turning on history… while it works, then focuses the heading", async () => {
      const fake = fakeSource({ kind: "not-a-repository" });
      const { root } = await openPage(fake);
      const turnOn = button(root, "Turn on history");
      await act(async () => {
        turnOn.click();
      });
      expect(turnOn.textContent).toContain("Turning on history…");
      await act(settle);
      expect(document.activeElement).toBe(root.querySelector("h1"));
    });

    it("says the folder is part of a larger repository as a note, with no button", async () => {
      const { root } = await openPage(fakeSource({ kind: "nested-repository" }));
      expect(root.textContent).toContain(
        "Your folder is part of a larger git repository, so Halonic can't show its changes here. See them with git.",
      );
      expect(root.textContent).not.toContain("Couldn't load changes");
      expect(root.textContent).not.toContain("History is off");
      expect(root.textContent).not.toContain("folder_not_opened");
      expect(root.querySelector("button")).toBeNull();
    });

    it("lets the heading take focus from code", async () => {
      const { root } = await openPage(fakeSource({ kind: "ready", changes: [] }));
      expect(root.querySelector("h1")?.getAttribute("tabindex")).toBe("-1");
    });
  });
});
