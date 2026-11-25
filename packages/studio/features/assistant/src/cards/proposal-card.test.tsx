// @vitest-environment jsdom
import type { FileReview, ReviewOutcome, ReviewTarget } from "@halonicjs/app";
import { createToastStore, standaloneLinkClasses, ToastStoreProvider } from "@halonicjs/studio-kit";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssistantChange } from "../api.ts";
import { buildChatsOf } from "../chat/build-chats.ts";
import { buttonNamed, chatOf, fakeHost, show, unmount } from "../test-support.tsx";
import { cardReviewsOf, type Proposal } from "./card-reviews.ts";
import { ProposalCard } from "./proposal-card.tsx";

afterEach(unmount);

const path = "hubs/sales/workflows/triage.workflow.yaml";

function reviewOf(parts: number, deleted = false): FileReview {
  return {
    path,
    card: { chatId: "c1", cardId: "call-1" },
    baseline: "id: triage\n",
    seen: "absent",
    deleted,
    parts: Array.from({ length: deleted ? 0 : parts }, (_, at) => ({
      beforeStart: at,
      beforeEnd: at + 1,
      afterStart: at,
      removed: [`old ${at}\n`],
      added: [`new ${at}\n`],
    })),
  };
}

/** A host whose one file has `start` to review; Accept and Reject decide it all, Undo brings it back. */
function reviewHost(start: FileReview | null) {
  const fake = fakeHost([chatOf("c1", [{ role: "user", content: "Page on-call" }])]);
  let open = start;
  let listener: ((change: AssistantChange) => void) | undefined;
  const decided: [string, ReviewTarget][] = [];
  const changed = (review: FileReview | null) => {
    open = review;
    listener?.({ kind: "review", paths: [path] });
  };
  const step = { files: [{ path, record: { before: null, after: null } }] };
  const done = (): ReviewOutcome => ({ status: "done", step, held: [] });
  Object.assign(fake.host, {
    changesForCard: async () => (open === null ? [] : [open]),
    accept: async (target: ReviewTarget) => {
      decided.push(["accept", target]);
      changed(null);
      return done();
    },
    reject: async (target: ReviewTarget) => {
      decided.push(["reject", target]);
      changed(null);
      return done();
    },
    undo: async () => {
      changed(start);
      return done();
    },
    onDidChange: (each: (change: AssistantChange) => void) => {
      listener = each;
      return () => {};
    },
  });
  return { fake, decided, changed };
}

function card(
  host: ReturnType<typeof reviewHost>,
  content: string | null = "id: triage\n",
  afterReading: readonly string[] = [],
) {
  const toasts = createToastStore();
  const openItem = vi.fn();
  const openPlace = vi.fn();
  const services = { get: () => host.fake.host, find: () => host.fake.host };
  const announce = vi.fn();
  const announcer = { announce };
  const context = { services, openItem, openPlace, announcer } as unknown as WorkspaceContext;
  const proposal: Proposal = { chatId: "c1", callId: "call-1", path, content };
  const node = (
    <ToastStoreProvider store={toasts}>
      <ProposalCard
        proposal={proposal}
        why="Pages on-call"
        afterReading={afterReading}
        context={context}
      />
    </ToastStoreProvider>
  );
  return { node, toasts, openItem, openPlace, proposal, announce };
}

const press = (page: HTMLElement, name: string) =>
  act(async () => buttonNamed(page, name)?.click());

verifies("assistant.build.proposal-card", () => {
  describe("ProposalCard", () => {
    it("names the card by its tag and sentence, with the path, the why and the actions", async () => {
      const page = await show(card(reviewHost(reviewOf(2))).node);
      const article = page.querySelector("article");
      expect(article?.getAttribute("aria-label")).toBe("Changed: triage: Changed");
      expect(article?.textContent).toContain(path);
      expect(article?.textContent).toContain("“Pages on-call”");
      expect(article?.textContent).not.toContain("Saved");
      for (const name of ["Review", "Accept all", "Reject all"]) {
        expect(buttonNamed(page, name)?.getAttribute("aria-describedby")).toBeTruthy();
      }
    });

    it("cuts a long why at 3 lines, and more opens the rest", async () => {
      const scroll = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(120);
      const height = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(60);
      try {
        const page = await show(card(reviewHost(reviewOf(1))).node);
        const why = [...page.querySelectorAll("p")].find((each) =>
          each.textContent?.startsWith("“"),
        );
        expect(why?.className).toContain("line-clamp-3");
        expect(buttonNamed(page, "more")?.getAttribute("aria-controls")).toBe(why?.id);
        expect(buttonNamed(page, "more")?.className).toContain(standaloneLinkClasses);
        await press(page, "more");
        expect(why?.className).not.toContain("line-clamp-3");
        expect(document.activeElement).toBe(why);
        expect(why?.textContent).toBe("“Pages on-call”");
        expect(buttonNamed(page, "more")).toBeUndefined();
      } finally {
        scroll.mockRestore();
        height.mockRestore();
      }
    });

    it("leaves out more when the why fits", async () => {
      const page = await show(card(reviewHost(reviewOf(1))).node);
      expect(buttonNamed(page, "more")).toBeUndefined();
    });

    it("shows the diff's removed and added lines", async () => {
      const page = await show(card(reviewHost(reviewOf(1))).node);
      expect(page.querySelector("details")?.open).toBe(false);
      expect(page.querySelector("del")?.textContent).toBe("− old 0");
      expect(page.querySelector("ins")?.textContent).toBe("+ new 0");
    });

    it("says how many changes are left once some were decided elsewhere", async () => {
      const host = reviewHost(reviewOf(3));
      const page = await show(card(host).node);
      expect(page.textContent).not.toContain("left to review");
      await act(async () => host.changed(reviewOf(1)));
      expect(page.textContent).toContain("1 of 3 changes left to review");
    });

    it("opens the workflow with Review, and Changes for a delete", async () => {
      const shown = card(reviewHost(reviewOf(1)));
      const page = await show(shown.node);
      await press(page, "Review");
      expect(shown.openItem).toHaveBeenCalledWith({ kind: "workflow", hub: "sales", id: "triage" });
      unmount();
      const deleting = card(reviewHost(reviewOf(1, true)), null);
      const deleted = await show(deleting.node);
      expect(deleted.querySelector("article")?.getAttribute("aria-label")).toMatch(/^Delete: /);
      await press(deleted, "Show the diff");
      expect(deleted.textContent).toContain("The whole file is deleted.");
      await press(deleted, "Review");
      expect(deleting.openPlace).toHaveBeenCalledWith("changes");
    });

    it("says why it can't read its changes, and keeps only Review", async () => {
      const host = reviewHost(reviewOf(1));
      Object.assign(host.fake.host, {
        changesForCard: async () => Promise.reject(new Error("Gone.")),
      });
      const shown = card(host);
      const page = await show(shown.node);
      expect(page.textContent).toContain("Couldn't read these changes: Gone.");
      expect(page.textContent).not.toContain("Gone..");
      expect(buttonNamed(page, "Accept all")).toBeUndefined();
      expect(buttonNamed(page, "Reject all")).toBeUndefined();
      await press(page, "Review");
      expect(shown.openItem).toHaveBeenCalledWith({ kind: "workflow", hub: "sales", id: "triage" });
    });
  });
});

verifies("assistant.build.apply-proposal", () => {
  describe("Accept all", () => {
    it("accepts the card as one step, with a toast and Undo, and leaves a note for the model", async () => {
      const host = reviewHost(reviewOf(3));
      const shown = card(host);
      const page = await show(shown.node);
      await press(page, "Accept all");
      expect(host.decided).toEqual([
        ["accept", { kind: "card", card: { chatId: "c1", cardId: "call-1" } }],
      ]);
      expect(buttonNamed(page, "Accept all")).toBeUndefined();
      expect(document.activeElement?.textContent).toMatch(/^Accepted ?Now a change in triage\./);
      const [toast] = shown.toasts.list();
      expect(toast?.title).toBe("Accepted 3 changes in triage");
      await act(async () => toast?.action?.onClick());
      // The state line that had focus is gone: focus goes to Accept all, and Undo says what it did.
      expect(document.activeElement).toBe(buttonNamed(page, "Accept all"));
      expect(shown.announce).toHaveBeenCalledWith(
        "Undone. 3 changes in triage are back to review.",
        "polite",
      );
      expect(cardReviewsOf(host.fake.host).takeNotes("c1")).toEqual([]);
    });

    it("sends the note with the next message", async () => {
      const host = reviewHost(reviewOf(1));
      const page = await show(card(host).node);
      await press(page, "Accept all");
      const chats = buildChatsOf(host.fake.host);
      await act(async () => chats.open());
      void chats.send("c1", "Thanks", () => {});
      expect(host.fake.requests[0]?.notes).toEqual([
        `(The person accepted the changes to ${path}.)`,
      ]);
      await host.fake.finish({ messages: [], end: { reason: "answered" } } as never);
    });

    it("names the item when Undo fails", async () => {
      const host = reviewHost(reviewOf(1));
      Object.assign(host.fake.host, { undo: async () => Promise.reject(new Error("Disk full")) });
      const shown = card(host);
      const page = await show(shown.node);
      await press(page, "Accept all");
      await act(async () => shown.toasts.list()[0]?.action?.onClick());
      expect(shown.toasts.list().find((toast) => toast.tone === "danger")).toMatchObject({
        title: "Couldn't undo it in triage",
        text: "Disk full",
      });
    });
  });
});

verifies("assistant.build.reject-proposal", () => {
  it("rejects the card as one step, with a toast and Undo, and leaves a note for the model", async () => {
    const host = reviewHost(reviewOf(1));
    const shown = card(host);
    const page = await show(shown.node);
    await press(page, "Reject all");
    expect(host.decided.map(([decision]) => decision)).toEqual(["reject"]);
    expect(buttonNamed(page, "Reject all")).toBeUndefined();
    expect(shown.toasts.list()[0]?.title).toBe("Rejected 1 change in triage");
    expect(cardReviewsOf(host.fake.host).takeNotes("c1")).toEqual([
      `(The person rejected the changes to ${path}. The file is back as it was.)`,
    ]);
  });

  it("says why when the reject fails, and keeps the actions", async () => {
    const host = reviewHost(reviewOf(1));
    Object.assign(host.fake.host, { reject: async () => Promise.reject(new Error("Disk full")) });
    const shown = card(host);
    const page = await show(shown.node);
    await press(page, "Reject all");
    expect(shown.toasts.list()[0]).toMatchObject({
      tone: "danger",
      title: "Couldn't reject the changes in triage",
      text: "Disk full",
    });
    expect(buttonNamed(page, "Reject all")).toBeDefined();
  });
});

verifies("assistant.build.loaded-page", () => {
  it("says a change written after reading docs pages names their sites", async () => {
    const page = await show(card(reviewHost(reviewOf(1)), undefined, ["docs.example.com"]).node);
    expect(page.querySelector("article")?.textContent).toContain(
      "Written after reading docs.example.com",
    );
  });

  it("says nothing of pages for a change written before any", async () => {
    const page = await show(card(reviewHost(reviewOf(1))).node);
    expect(page.querySelector("article")?.textContent).not.toContain("Written after reading");
  });
});
