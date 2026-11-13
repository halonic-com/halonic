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
import { ListedToolsReviewModel } from "../listed-tools-review-model.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ListedToolsReviewDialog } from "./listed-tools-review-dialog.tsx";

beforeEach(fakeModal);
afterEach(() => {
  vi.restoreAllMocks();
  unmountAll();
  restoreModal();
});

function row(name: string): ListedToolRow {
  return {
    name,
    fingerprint: `htl1:${name}-1`,
    description: `Does ${name}.`,
    arguments: [],
    state: "not_approved",
    differences: [],
    serverChanged: false,
    leftOutArguments: [],
  };
}

function snapshot(toReview: readonly string[], approved: readonly string[] = []) {
  return {
    sourceName: "Notes server",
    toReview: toReview.map(row),
    keepsChanging: [],
    refused: [],
    approved,
    listingRefused: null,
    unreadable: null,
    hasApprovals: approved.length > 0,
  } satisfies ListedToolsSnapshot;
}

async function open(tools: ListedToolsSnapshot) {
  const approvals: (readonly ListedToolPick[])[] = [];
  let waiting = tools.toReview;
  const host: ListedToolsHost = {
    review: async () => ({ ...tools, toReview: waiting }),
    approve: async (_id, picks) => {
      approvals.push(picks);
      waiting = waiting.filter((tool) => !picks.some((pick) => pick.name === tool.name));
      return { approved: picks.map((pick) => pick.name), changed: [] };
    },
    removeApproval: async () => {},
    subscribe: () => () => {},
  };
  const model = new ListedToolsReviewModel(host, "notes");
  const closes: (string | null)[] = [];
  const container = render(
    <ListedToolsReviewDialog model={model} onClose={(toast) => closes.push(toast)} />,
  );
  await act(() => model.refresh());
  return { container, closes, approvals };
}

function button(container: HTMLElement, name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.replace("Approving…", "") === name,
  );
  if (found === undefined) throw new Error(`No button "${name}"`);
  return found;
}

/** Types into a React-controlled input the way the browser does. */
function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

const names = (count: number) => Array.from({ length: count }, (_, index) => `tool_${index}`);

describe("the review dialog", () => {
  verifies("library.listed-tools-review", () => {
    it("offers Approve none, Approve all and Approve selected, in that order", async () => {
      const { container } = await open(snapshot(["a", "b"]));
      const footer = [...(container.querySelector("footer")?.querySelectorAll("button") ?? [])];
      expect(footer.map((candidate) => candidate.textContent?.replace("Approving…", ""))).toEqual([
        "Approve none",
        "Approve all",
        "Approve selected",
      ]);
    });

    it("closes with a toast on Approve none and approves nothing", async () => {
      const { container, closes, approvals } = await open(snapshot(["a", "b"]));
      await act(async () => button(container, "Approve none").click());
      expect(closes).toEqual(["Nothing approved. 2 tools from Notes server stay off."]);
      expect(approvals).toEqual([]);
    });

    it("closes without a toast on Esc", async () => {
      const { container, closes } = await open(snapshot(["a", "b"]));
      const escapeKey = new Event("cancel", { cancelable: true });
      await act(async () => container.querySelector("dialog")?.dispatchEvent(escapeKey));
      expect(closes).toEqual([null]);
    });

    it("approves everything shown on Approve all and closes with the toast", async () => {
      const { container, closes, approvals } = await open(snapshot(["a", "b"]));
      await act(async () => button(container, "Approve all").click());
      expect(approvals.map((picks) => picks.map((pick) => pick.name))).toEqual([["a", "b"]]);
      expect(closes).toEqual(["Approved 2 tools from Notes server"]);
    });

    it("says to tick something when Approve selected has nothing ticked", async () => {
      // The Dialog's alert slot fills a frame after the attempt; run that frame at once.
      vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
        callback(0);
        return 0;
      });
      const { container, closes } = await open(snapshot(["a", "b"]));
      await act(async () => button(container, "Approve selected").click());
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        "Tick the tools you want to approve.",
      );
      expect(closes).toEqual([]);
    });

    it("shows the search only above the threshold, and counts what it leaves", async () => {
      const few = await open(snapshot(names(3)));
      expect(few.container.querySelector('input[type="search"]')).toBeNull();
      unmountAll();
      const many = await open(snapshot(names(11)));
      expect(many.container.querySelector('input[type="search"]')).not.toBeNull();
    });

    it("counts what the search leaves, approves only that, and clears", async () => {
      const { container, approvals } = await open(snapshot(names(11)));
      const input = container.querySelector<HTMLInputElement>('input[type="search"]');
      if (input === null) throw new Error("No search");
      await act(async () => typeInto(input, "tool_1"));
      expect(container.querySelector('[role="status"]')?.textContent).toBe("2 tools shown");
      await act(async () => button(container, "Approve all 2 shown").click());
      expect(approvals.map((picks) => picks.map((pick) => pick.name))).toEqual([
        ["tool_1", "tool_10"],
      ]);
    });

    it("says when nothing matches and offers Clear search", async () => {
      const { container } = await open(snapshot(names(11)));
      const input = container.querySelector<HTMLInputElement>('input[type="search"]');
      if (input === null) throw new Error("No search");
      await act(async () => typeInto(input, "zzz"));
      expect(container.querySelector('[role="status"]')?.textContent).toBe('No tools match "zzz".');
      await act(async () =>
        container.querySelector<HTMLButtonElement>('button[aria-label="Clear search"]')?.click(),
      );
      expect(container.querySelector('[role="status"]')?.textContent).toBe("");
    });

    it("reports a close once when the browser closes it while an approval runs", async () => {
      const { container, closes } = await open(snapshot(["a", "b"]));
      await act(async () => {
        const pending = button(container, "Approve all");
        pending.click();
        container.querySelector("dialog")?.dispatchEvent(new Event("close"));
        await Promise.resolve();
      });
      expect(closes).toHaveLength(1);
    });
  });
});
