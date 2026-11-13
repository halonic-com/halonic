// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ListedToolPick,
  ListedToolRow,
  ListedToolsHost,
  ListedToolsSnapshot,
} from "../listed-tools-host.ts";
import { ListedToolsReviewModel, type ReviewOutcome } from "../listed-tools-review-model.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ListedToolsReviewBody } from "./listed-tools-review-body.tsx";

/** What the host was asked to approve, for the test that is running. */
let approvals: (readonly ListedToolPick[])[] = [];

beforeEach(() => {
  approvals = [];
});
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

function hostFor(
  snapshot: ListedToolsSnapshot,
  removals: string[] = [],
  failRemoval = false,
): ListedToolsHost {
  return {
    review: async () => snapshot,
    approve: async (_id, picks) => {
      approvals.push(picks);
      return { approved: picks.map((pick) => pick.name), changed: [] };
    },
    removeApproval: async (_id, name) => {
      if (failRemoval) throw new Error("The server said no.");
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

async function open(snapshot: ListedToolsSnapshot, removals: string[] = [], failRemoval = false) {
  const model = new ListedToolsReviewModel(hostFor(snapshot, removals, failRemoval), "notes");
  const removed: string[] = [];
  const outcomes: ReviewOutcome[] = [];
  const container = render(
    <ListedToolsReviewBody
      model={model}
      onRemoved={(toast) => removed.push(toast)}
      onOutcome={(outcome) => outcomes.push(outcome)}
    />,
  );
  await act(() => model.refresh());
  return { container, model, removed, outcomes };
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

    it("offers Show all only when the description is cut, and folds again", async () => {
      const clamp = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(120);
      const height = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(60);
      try {
        const { container } = await open(base);
        const toggle = () =>
          [...container.querySelectorAll("button")].find((candidate) =>
            candidate.textContent?.startsWith("Show"),
          );
        expect(toggle()?.textContent).toBe("Show all");
        await act(async () => toggle()?.click());
        expect(toggle()?.textContent).toBe("Show less");
        expect(toggle()?.getAttribute("aria-expanded")).toBe("true");
      } finally {
        clamp.mockRestore();
        height.mockRestore();
      }
    });

    it("leaves out Show all when nothing is cut", async () => {
      const { container } = await open(base);
      expect(container.textContent).not.toContain("Show all");
    });

    it("lists arguments and what Halonic left out of them", async () => {
      const { container } = await open({
        ...base,
        toReview: [
          row("search_notes", {
            arguments: [{ name: "query", type: "string", description: "What to find" }],
            leftOutArguments: ["too many arguments"],
          }),
        ],
      });
      expect(container.textContent).toContain("query (string): What to find");
      expect(container.textContent).toContain(
        "Halonic left out part of its arguments: too many arguments.",
      );
    });

    it("lists tools that keep changing with their line, and keeps the order the host gives", async () => {
      const { container } = await open({
        ...base,
        hasApprovals: true,
        toReview: [row("beta", { state: "changed" }), row("alpha")],
      });
      expect(container.textContent).toContain("Keeps changing");
      expect(container.textContent).toContain("sync_tags");
      const names = [...container.querySelectorAll("li .font-mono")].map((n) => n.textContent);
      expect(names.indexOf("beta")).toBeLessThan(names.indexOf("alpha"));
    });

    it("cuts a refused reason between characters, not inside an emoji", async () => {
      const { container } = await open({
        ...base,
        refused: [{ name: "look up", reason: `${"x".repeat(63)}😀😀` }],
      });
      const refused = container.querySelector('li[title^="look up"]');
      expect(refused?.textContent).toBe(`look up: ${"x".repeat(63)}😀…`);
    });

    it("shows no toast and keeps the approval when removing fails", async () => {
      const { container, removed } = await open(base, [], true);
      const button = [...container.querySelectorAll("button")].find((candidate) =>
        candidate.textContent?.startsWith("Remove approval"),
      );
      await act(async () => button?.click());
      expect(removed).toEqual([]);
      expect(container.textContent).toContain("read_note");
    });
  });

  verifies("library.listed-tools-review-states", () => {
    it("approves a tool that keeps changing only by its own button, at the version shown", async () => {
      const { container, outcomes } = await open(base);
      const button = [...container.querySelectorAll("button")].find((candidate) =>
        candidate.textContent?.startsWith("Approve this version"),
      );
      expect(button?.textContent).toBe("Approve this version of sync_tags");
      await act(async () => button?.click());
      expect(approvals).toEqual([[{ name: "sync_tags", fingerprint: "htl1:sync_tags-1" }]]);
      // Another tool still waits, so the review stays open.
      expect(outcomes).toEqual([{ kind: "stay" }]);
    });
  });
});
