// @vitest-environment jsdom
import type { FileReview, ItemToReview, ReviewOutcome, ReviewTarget } from "@halonicjs/app";
import { createToastStore, PresentationProvider, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act, createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssistantChange } from "../api.ts";
import { cardReviewsOf } from "../cards/card-reviews.ts";
import { stripWords } from "../cards/card-words.ts";
import { buttonNamed, fakeHost, show, unmount } from "../test-support.tsx";
import { ReviewStrip } from "./review-strip.tsx";

afterEach(unmount);

const files = {
  "hubs/sales/workflows/triage.workflow.yaml": 3,
  "hubs/sales/agents/billing.agent.yaml": 2,
  "models.yaml": 2,
} as const;

function reviewOf(path: string, parts: number): FileReview {
  return {
    path,
    card: { chatId: "c1", cardId: `call-${path}` },
    baseline: "id: x\n",
    seen: "absent",
    deleted: false,
    parts: Array.from({ length: parts }, (_, at) => ({
      beforeStart: at,
      beforeEnd: at + 1,
      afterStart: at,
      removed: [`old ${at}\n`],
      added: [`new ${at}\n`],
    })),
  };
}

/** A host whose chat c1 has `paths` to review; a decision decides all but `held`. */
function stripHost(paths: readonly (keyof typeof files)[], held: readonly string[] = []) {
  const fake = fakeHost();
  let open = [...paths];
  const listeners = new Set<(change: AssistantChange) => void>();
  const changed = (paths: readonly string[]) => {
    for (const listener of listeners) listener({ kind: "review", paths });
  };
  const decided: [string, ReviewTarget][] = [];
  const decide = (decision: string) => async (target: ReviewTarget) => {
    decided.push([decision, target]);
    const done = open.filter((path) => !held.includes(path));
    open = open.filter((path) => held.includes(path));
    changed(done);
    const step = { files: done.map((path) => ({ path, record: { before: null, after: null } })) };
    return { status: "done", step, held } satisfies ReviewOutcome;
  };
  Object.assign(fake.host, {
    itemsToReview: async (): Promise<readonly ItemToReview[]> =>
      open.map((path) => ({ path, card: { chatId: "c1", cardId: `call-${path}` } })),
    changesIn: async (path: keyof typeof files) =>
      open.includes(path) ? reviewOf(path, files[path]) : null,
    accept: decide("accept"),
    reject: decide("reject"),
    undo: async () => {
      open = [...paths];
      changed(open);
      return { status: "done", step: { files: [] }, held: [] };
    },
    onDidChange: (each: (change: AssistantChange) => void) => {
      listeners.add(each);
      return () => listeners.delete(each);
    },
  });
  return { fake, decided };
}

function strip(host: ReturnType<typeof stripHost>, answering = false) {
  const toasts = createToastStore();
  const announce = vi.fn();
  const box = createRef<HTMLTextAreaElement>();
  const node = (
    <ToastStoreProvider store={toasts}>
      <ReviewStrip
        host={host.fake.host}
        chatId="c1"
        answering={answering}
        box={box}
        announce={announce}
      />
    </ToastStoreProvider>
  );
  return { node, toasts, announce };
}

const press = (page: HTMLElement, name: string) =>
  act(async () => buttonNamed(page, name)?.click());

verifies("assistant.chat.apply-all", () => {
  describe("ReviewStrip", () => {
    it("counts the items to review, with Accept all and Reject all", async () => {
      const page = await show(
        strip(stripHost(["models.yaml", "hubs/sales/agents/billing.agent.yaml"])).node,
      );
      expect(page.textContent).toContain("2 items to review");
      expect(buttonNamed(page, "2 items to review, go to the next one")).toBeDefined();
      expect(buttonNamed(page, "Accept all")?.getAttribute("aria-disabled")).toBeNull();
      expect(buttonNamed(page, "Reject all")).toBeDefined();
    });

    it("isn't there with one item", async () => {
      const page = await show(strip(stripHost(["models.yaml"])).node);
      expect(page.textContent).toBe("");
    });

    it("accepts every change of the chat as one step, with a toast and Undo", async () => {
      const host = stripHost([
        "hubs/sales/workflows/triage.workflow.yaml",
        "hubs/sales/agents/billing.agent.yaml",
        "models.yaml",
      ]);
      const shown = strip(host);
      const page = await show(shown.node);
      await press(page, "Accept all");
      expect(host.decided).toEqual([["accept", { kind: "chat", chatId: "c1" }]]);
      const [toast] = shown.toasts.list();
      expect(toast).toMatchObject({ tone: "info", title: "Accepted 7 changes in 3 items" });
      expect(page.textContent).toBe("");
      expect(cardReviewsOf(host.fake.host).takeNotes("c1")).toEqual([
        "(The person accepted the changes to hubs/sales/workflows/triage.workflow.yaml.)",
        "(The person accepted the changes to hubs/sales/agents/billing.agent.yaml.)",
        "(The person accepted the changes to models.yaml.)",
      ]);
      await act(async () => toast?.action?.onClick());
      expect(shown.announce).toHaveBeenCalledWith("Undone: accepted 7 changes", "polite");
      expect(page.textContent).toContain("3 items to review");
    });

    it("rejects every change of the chat with Reject all", async () => {
      const host = stripHost(["models.yaml", "hubs/sales/agents/billing.agent.yaml"]);
      const shown = strip(host);
      const page = await show(shown.node);
      await press(page, "Reject all");
      expect(host.decided.map(([decision]) => decision)).toEqual(["reject"]);
      expect(shown.toasts.list()[0]?.title).toBe("Rejected 4 changes in 2 items");
    });

    it("makes both wait while the chat answers, with the reason under the count", async () => {
      const host = stripHost(["models.yaml", "hubs/sales/agents/billing.agent.yaml"]);
      const page = await show(strip(host, true).node);
      const reason = [...page.querySelectorAll("p")].find(
        (each) => each.textContent === "Wait for the answer to finish.",
      );
      expect(reason).toBeDefined();
      for (const name of ["Accept all", "Reject all"]) {
        const button = buttonNamed(page, name);
        expect(button?.getAttribute("aria-disabled")).toBe("true");
        expect(button?.getAttribute("aria-describedby")).toContain(reason?.id);
      }
      await press(page, "Accept all");
      expect(host.decided).toEqual([]);
    });

    it("names an item that waits for Compare, never a plain success", async () => {
      const triage = "hubs/sales/workflows/triage.workflow.yaml";
      const host = stripHost(
        [triage, "hubs/sales/agents/billing.agent.yaml", "models.yaml"],
        [triage],
      );
      const shown = strip(host);
      const page = await show(shown.node);
      await press(page, "Accept all");
      expect(shown.toasts.list()[0]).toMatchObject({
        tone: "warning",
        title: "Accepted 4 changes in 2 items. triage waits for Compare.",
      });
    });

    it("says nothing was decided when every item waits for Compare", async () => {
      const both = ["models.yaml", "hubs/sales/agents/billing.agent.yaml"] as const;
      const shown = strip(stripHost(both, both));
      const page = await show(shown.node);
      await press(page, "Reject all");
      const [toast] = shown.toasts.list();
      expect(toast).toMatchObject({
        tone: "warning",
        title: "Nothing rejected. models and billing wait for Compare.",
      });
      expect(toast?.action).toBeUndefined();
    });

    it("lists three waiting items, then how many more", () => {
      expect(stripWords.waiting(["A", "B", "C"])).toBe("A, B and C wait for Compare.");
      expect(stripWords.waiting(["A", "B", "C", "D", "E"])).toBe(
        "A, B, C and 2 more wait for Compare.",
      );
    });

    it("names the items when Undo fails", async () => {
      const host = stripHost(["models.yaml", "hubs/sales/agents/billing.agent.yaml"]);
      Object.assign(host.fake.host, { undo: async () => Promise.reject(new Error("Disk full")) });
      const shown = strip(host);
      const page = await show(shown.node);
      await press(page, "Accept all");
      await act(async () => shown.toasts.list()[0]?.action?.onClick());
      expect(shown.toasts.list().find((toast) => toast.tone === "danger")).toMatchObject({
        title: "Couldn't undo the changes in 2 items",
        text: "Disk full",
      });
    });

    it("moves focus to the next card's Review with the count", async () => {
      const host = stripHost(["models.yaml", "hubs/sales/agents/billing.agent.yaml"]);
      const page = await show(
        <div>
          <button type="button" id="card-review-a">
            Review
          </button>
          <button type="button" id="card-review-b">
            Review
          </button>
          {strip(host).node}
        </div>,
      );
      await press(page, "2 items to review, go to the next one");
      expect(document.activeElement?.id).toBe("card-review-a");
      await press(page, "2 items to review, go to the next one");
      expect(document.activeElement?.id).toBe("card-review-b");
    });
  });
});

verifies("assistant.build.phone-review", () => {
  it("on a phone, reads '2 to review' while the chat answers, with the reason under the count", async () => {
    const host = stripHost(["models.yaml", "hubs/sales/agents/billing.agent.yaml"]);
    const page = await show(
      <PresentationProvider presentation="phone">{strip(host, true).node}</PresentationProvider>,
    );
    expect(page.firstElementChild?.className).toContain("min-h-14");
    expect(buttonNamed(page, "2 items to review, go to the next one")?.textContent).toBe(
      "2 to review",
    );
    expect(page.textContent).toContain("Wait for the answer to finish.");
  });
});
