// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { ListedToolRow, ListedToolsHost, ListedToolsSnapshot } from "../listed-tools-host.ts";
import { ListedToolsReviewModel } from "../listed-tools-review-model.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ListedToolsReviewBody } from "./listed-tools-review-body.tsx";

afterEach(unmountAll);

function row(name: string, overrides: Partial<ListedToolRow> = {}): ListedToolRow {
  return {
    name,
    fingerprint: `htl1:${name}-1`,
    description: `Does ${name}.`,
    arguments: [],
    state: "not_approved",
    differences: [],
    serverChanged: false,
    leftOutArguments: [],
    ...overrides,
  };
}

function hostFor(snapshot: ListedToolsSnapshot, removals: string[] = []): ListedToolsHost {
  return {
    review: async () => snapshot,
    approve: async () => ({ approved: [], changed: [] }),
    removeApproval: async (_id, name) => {
      removals.push(name);
    },
    subscribe: () => () => {},
  };
}

const base: ListedToolsSnapshot = {
  sourceName: "Notes server",
  toReview: [row("search_notes", { description: "<b>Finds</b> notes." })],
  keepsChanging: [row("sync_tags")],
  refused: [{ name: "look up", reason: "x".repeat(80) }],
  approved: ["read_note"],
  listingRefused: null,
  unreadable: null,
  hasApprovals: false,
};

async function open(snapshot: ListedToolsSnapshot, removals: string[] = []) {
  const model = new ListedToolsReviewModel(hostFor(snapshot, removals), "notes");
  const removed: string[] = [];
  const container = render(
    <ListedToolsReviewBody model={model} onRemoved={(toast) => removed.push(toast)} />,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { container, model, removed };
}

describe("the review body", () => {
  verifies("library.listed-tools-review", () => {
    it("shows server text as plain text and starts with nothing ticked", async () => {
      const { container } = await open(base);
      expect(container.textContent).toContain("<b>Finds</b> notes.");
      expect(container.querySelector("b")).toBeNull();
      const box = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
      expect(box?.checked).toBe(false);
      expect(container.textContent).not.toContain("Not approved");
    });

    it("gives tools that keep changing and refused tools no tick box", async () => {
      const { container } = await open(base);
      expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
      const refused = container.querySelector('li[title^="look up"]');
      expect(refused?.textContent).toBe(`look up: ${"x".repeat(64)}…`);
    });

    it("shows the state chip once something was approved before", async () => {
      const { container } = await open({
        ...base,
        hasApprovals: true,
        toReview: [row("search_notes", { state: "changed" })],
      });
      expect(container.textContent).toContain("Changed");
    });

    it("removes an approval and hands the toast to the dialog", async () => {
      const removals: string[] = [];
      const { container, removed } = await open(base, removals);
      const button = [...container.querySelectorAll("button")].find((candidate) =>
        candidate.textContent?.startsWith("Remove approval"),
      );
      expect(button?.textContent).toBe("Remove approval for read_note");
      await act(async () => button?.click());
      expect(removals).toEqual(["read_note"]);
      expect(removed).toEqual([
        "Removed your approval for read_note. It's off until you approve it again.",
      ]);
    });
  });
});
