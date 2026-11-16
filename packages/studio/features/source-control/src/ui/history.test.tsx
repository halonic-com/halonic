// @vitest-environment jsdom
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { Version } from "../api.ts";
import { ChangesList } from "../changes-list.ts";
import { fakeSource, settle } from "../source.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ChangesView } from "./changes-page.tsx";

afterEach(unmountAll);

const recent = Date.now() - 60_000;
const versions = (count: number): Version[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `v${count - i}`,
    name: `Version ${count - i}`,
    notes: count - i === count ? "Only for tickets in NL.\nSecond line." : "",
    author: "Sam Lee",
    at: recent - i * 1000,
    files: count - i === count ? ["agents/sorter.agent.yaml", "skills/tone/SKILL.md"] : [],
  }));

async function openPage(fake: ReturnType<typeof fakeSource>) {
  const list = new ChangesList(fake.source);
  const root = render(<ChangesView list={list} />);
  await act(settle);
  return { root, list };
}

const rowOf = (root: HTMLElement, name: string): HTMLElement => {
  const found = [...root.querySelectorAll<HTMLElement>('[role="gridcell"]')].find((row) =>
    row.textContent?.includes(name),
  );
  if (found === undefined) throw new Error(`no row ${name}`);
  return found;
};

const history = (root: HTMLElement) => root.querySelector<HTMLElement>("section[aria-labelledby]");

verifies("source-control.history", () => {
  describe("History on the Changes page", () => {
    it("lists the newest 20 versions under Today with author and time, and Show more", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      fake.setHistory(versions(25));
      const { root } = await openPage(fake);
      expect(root.textContent).toContain("History");
      expect(root.textContent).toContain("Today");
      expect(root.textContent).toContain("Version 25");
      expect(root.textContent).toContain("Version 6");
      expect(root.textContent).not.toContain("Version 5");
      expect(root.textContent).toContain("Sam Lee");
    });

    it("shows 20 more when Show more is pressed, and the button goes when there are no more", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      fake.setHistory(versions(25));
      const { root } = await openPage(fake);
      const button = [...root.querySelectorAll("button")].find(
        (b) => b.textContent === "Show more",
      );
      expect(button).toBeDefined();
      await act(async () => {
        button?.click();
        await settle();
      });
      expect(root.textContent).toContain("Version 1");
      expect(root.textContent).not.toContain("Show more");
    });

    it("shows a picked version's author, date, notes and files beside the list, not only on hover", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      fake.setHistory(versions(3));
      const { root } = await openPage(fake);
      expect(root.querySelector('[aria-label^="Version \\""]')).toBeNull();
      act(() => rowOf(root, "Version 3").click());
      const details = root.querySelector('section[aria-label="Version \\"Version 3\\""]');
      expect(details?.textContent).toContain("Sam Lee");
      expect(details?.textContent).toContain("Only for tickets in NL.");
      expect(details?.textContent).toContain("2 files");
      expect(details?.textContent).toContain("skills/tone/SKILL.md");
      expect(rowOf(root, "Version 3").closest("tr")?.getAttribute("aria-current")).toBe("true");
    });

    it("puts the details in a column beside the list and Show more, not after them", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      fake.setHistory(versions(25));
      const { root } = await openPage(fake);
      act(() => rowOf(root, "Version 25").click());
      const list = root.querySelector('[data-part="history-list"]');
      const details = root.querySelector('section[aria-label="Version \\"Version 25\\""]');
      expect(list?.textContent).toContain("Show more");
      expect(list?.contains(details ?? null)).toBe(false);
      expect(details?.parentElement).toBe(list?.parentElement);
    });

    it("says No versions yet. for a repository without a version", async () => {
      const { root } = await openPage(fakeSource({ kind: "ready", changes: [] }));
      expect(history(root)?.textContent).toContain("No versions yet.");
    });

    it("keeps History under the changes", async () => {
      const fake = fakeSource({
        kind: "ready",
        changes: [{ path: "models.yaml", status: "modified", staged: false }],
      });
      fake.setTexts("models.yaml", { before: "a: 1\n", after: "a: 2\n" });
      fake.setHistory(versions(1));
      const { root } = await openPage(fake);
      const text = root.textContent ?? "";
      expect(text.indexOf("Since your last version")).toBeLessThan(text.indexOf("History"));
    });

    it("says why History couldn't load, with Try again, and loads it once git answers", async () => {
      const fake = fakeSource({ kind: "ready", changes: [] });
      fake.setHistory(versions(2));
      fake.failHistory(new KindedError("unavailable", "Locked"));
      const { root } = await openPage(fake);
      expect(root.querySelector('[role="alert"]')?.textContent).toContain(
        "Couldn't load history. Locked.",
      );
      fake.failHistory(undefined);
      const retry = [...root.querySelectorAll("button")].find((b) => b.textContent === "Try again");
      await act(async () => {
        retry?.click();
        await settle();
      });
      expect(root.textContent).toContain("Version 2");
      expect(root.querySelector('[role="alert"]')).toBeNull();
    });

    it("shows no History for a folder without history, and says everything saved is used right away", async () => {
      const { root } = await openPage(fakeSource({ kind: "not-a-repository" }));
      expect(root.textContent).not.toContain("No versions yet.");
      expect(root.textContent).toContain("History is off. Everything you save is used right away.");
    });
  });
});
