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
    asksBeforeUse: true,
  };
}

function snapshot(toReview: readonly string[], approved: readonly string[] = []) {
  return {
    sourceName: "Notes server",
    workspaceName: "Acme",
    toReview: toReview.map(row),
    keepsChanging: [],
    refused: [],
    approved,
    listingRefused: null,
    unreadable: null,
    hasApprovals: approved.length > 0,
  } satisfies ListedToolsSnapshot;
}

async function open(
  tools: ListedToolsSnapshot,
  review?: ListedToolsHost["review"],
  waitForTools = true,
) {
  const approvals: (readonly ListedToolPick[])[] = [];
  const removals: string[] = [];
  let waiting = tools.toReview;
  const host: ListedToolsHost = {
    review: review ?? (async () => ({ ...tools, toReview: waiting })),
    approve: async (_id, picks) => {
      approvals.push(picks);
      waiting = waiting.filter((tool) => !picks.some((pick) => pick.name === tool.name));
      return { approved: picks.map((pick) => pick.name), changed: [] };
    },
    removeApproval: async (_id, name) => {
      removals.push(name);
    },
    subscribe: () => () => {},
  };
  const model = new ListedToolsReviewModel(host, "notes");
  const closes: (string | null)[] = [];
  const container = render(
    <ListedToolsReviewDialog
      model={model}
      sourceName="Notes server"
      onClose={(toast) => closes.push(toast)}
    />,
  );
  if (waitForTools) await act(() => model.refresh());
  return { container, closes, approvals, removals, model };
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
        "Approve all (2)",
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
      await act(async () => button(container, "Approve all (2)").click());
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
        const pending = button(container, "Approve all (2)");
        pending.click();
        container.querySelector("dialog")?.dispatchEvent(new Event("close"));
        await Promise.resolve();
      });
      expect(closes).toHaveLength(1);
    });
  });

  verifies("library.listed-tools-review-states", () => {
    it("shows loading rows and no buttons while the tools are being read", async () => {
      vi.useFakeTimers();
      try {
        const never = new Promise<ListedToolsSnapshot>(() => {});
        const { container } = await open(snapshot(["a"]), () => never, false);
        expect(container.querySelector("dialog h2")?.textContent).toBe(
          "Review the tools from Notes server",
        );
        expect(container.querySelector("footer")).toBeNull();
        expect(container.querySelector('[role="status"]')?.textContent).toBe("");
        await act(async () => vi.advanceTimersByTime(1000));
        expect(container.querySelector('[role="status"]')?.textContent).toBe("Connecting…");
      } finally {
        vi.useRealTimers();
      }
    });

    it("says the tools couldn't be listed and reads them again on Try again", async () => {
      let serverUp = false;
      const { container } = await open(snapshot(["a"]), async () => {
        if (!serverUp) throw new Error("The server is down.");
        return snapshot(["a"]);
      });
      expect(container.textContent).toContain("Couldn't list the tools:");
      expect(container.querySelector("footer")).toBeNull();
      serverUp = true;
      await act(async () => button(container, "Try again").click());
      expect(container.textContent).toContain("Approve selected");
    });

    it("shows the loading rows while Try again reads, and the failure again if it fails again", async () => {
      let release: (() => void) | undefined;
      let retrying = false;
      const { container } = await open(snapshot(["a"]), async () => {
        if (retrying) await new Promise<void>((resolve) => (release = resolve));
        throw new Error("The server is down.");
      });
      expect(container.textContent).toContain("Couldn't list the tools:");
      retrying = true;
      await act(async () => button(container, "Try again").click());
      expect(container.textContent).not.toContain("Couldn't list the tools:");
      expect(container.querySelector('[role="status"]')).not.toBeNull();
      await act(async () => release?.());
      expect(container.textContent).toContain("Couldn't list the tools:");
    });

    it("shows a refused listing with no rows and no buttons", async () => {
      const { container } = await open({
        ...snapshot(["a"]),
        listingRefused: "it lists 400 tools",
      });
      expect(container.textContent).toContain(
        "Couldn't use the tool list from Notes server: it lists 400 tools. None of its listed tools are on.",
      );
      expect(container.querySelector("footer")).toBeNull();
      expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    });

    it("makes Remove approval unavailable, with its reason, when the tool isn't named", async () => {
      const { container, removals } = await open({ ...snapshot([]), unreadable: {} });
      expect(container.textContent).toContain(
        "Couldn't read an approval for Notes server, so none of its listed tools are on.",
      );
      const remove = button(container, "Remove approval");
      const reason = container.querySelector(`#${remove.getAttribute("aria-describedby")}`);
      expect(reason?.textContent).toBe("Halonic can't tell which tool it belongs to yet.");
      await act(async () => remove.click());
      expect(removals).toEqual([]);
    });

    it("removes an approval it can name, and never shows the store's error", async () => {
      const { container, removals } = await open({
        ...snapshot([]),
        unreadable: { toolName: "lookup" },
      });
      expect(container.textContent).toContain("Couldn't read your approval for lookup");
      await act(async () => button(container, "Remove approval").click());
      expect(removals).toEqual(["lookup"]);
    });

    it("says why removing an approval failed, in words that name the tool", async () => {
      const tools = { ...snapshot([]), unreadable: { toolName: "lookup" } };
      const model = new ListedToolsReviewModel(
        {
          review: async () => tools,
          approve: async () => ({ approved: [], changed: [] }),
          removeApproval: async () => {
            throw new Error("The disk is full.");
          },
          subscribe: () => () => {},
        },
        "notes",
      );
      const container = render(
        <ListedToolsReviewDialog model={model} sourceName="Notes server" onClose={() => {}} />,
      );
      await act(() => model.refresh());
      await act(async () => button(container, "Remove approval").click());
      expect(container.textContent).toContain("Couldn't remove your approval for lookup:");
      expect(container.textContent).not.toContain("Couldn't approve the tools");
    });

    it("offers only Close when just tools that keep changing are left", async () => {
      const { container, closes } = await open({
        ...snapshot([]),
        keepsChanging: [row("sync_tags")],
      });
      expect(container.querySelector("footer")).toBeNull();
      expect(container.textContent).not.toContain("Approve all");
      expect(container.textContent).not.toContain("Approve selected");
      await act(async () => button(container, "Close").click());
      expect(closes).toEqual([null]);
    });

    it("says nothing is waiting, with the Approved group and no buttons", async () => {
      const { container } = await open(snapshot([], ["send"]));
      expect(container.textContent).toContain("Nothing is waiting for your approval.");
      expect(container.textContent).toContain("Approved (1)");
      expect(container.querySelector("footer")).toBeNull();
    });
  });
});
