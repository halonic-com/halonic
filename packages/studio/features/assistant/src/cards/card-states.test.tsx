// @vitest-environment jsdom
import type { FileReview, ReviewCard, ReviewOutcome } from "@halonicjs/app";
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
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
const first: ReviewCard = { chatId: "c1", cardId: "call-1" };

function reviewOf(parts: number, baseline = "id: triage\n", card = first): FileReview {
  return {
    path,
    card,
    baseline,
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

/** A host with one file whose changes to review, and saved text, the test moves along. */
function filesHost(start: FileReview | null) {
  const fake = fakeHost([chatOf("c1", [{ role: "user", content: "Page on-call" }])]);
  const file = { open: start, saved: null as string | null };
  let listener: ((change: AssistantChange) => void) | undefined;
  const changed = (review: FileReview | null, saved: string | null = null) => {
    file.open = review;
    file.saved = saved;
    listener?.({ kind: "review", paths: [path] });
  };
  const step = { files: [{ path, record: { before: null, after: null } }] };
  let outcome: ReviewOutcome = { status: "done", step, held: [] };
  Object.assign(fake.host, {
    changesForCard: async (card: ReviewCard) =>
      file.open !== null && file.open.card.cardId === card.cardId ? [file.open] : [],
    changesIn: async () => file.open,
    savedText: async () => file.saved,
    accept: async () => outcome,
    reject: async () => {
      changed(null, "id: triage\n");
      return outcome;
    },
    onDidChange: (each: (change: AssistantChange) => void) => {
      listener = each;
      return () => {};
    },
  });
  const answer = (next: ReviewOutcome) => {
    outcome = next;
  };
  return { fake, changed, answer };
}

function cards(host: ReturnType<typeof filesHost>, ...ids: ReviewCard[]) {
  const toasts = createToastStore();
  const openItem = vi.fn();
  const openPlace = vi.fn();
  const announce = vi.fn();
  const services = { get: () => host.fake.host, find: () => host.fake.host };
  const announcer = { announce };
  const context = { services, openItem, openPlace, announcer } as unknown as WorkspaceContext;
  const proposalOf = (card: ReviewCard): Proposal => ({
    chatId: card.chatId,
    callId: card.cardId,
    path,
    content: "id: triage\nnew\n",
  });
  const node = (
    <ToastStoreProvider store={toasts}>
      {(ids.length === 0 ? [first] : ids).map((card) => (
        <ProposalCard
          key={card.cardId}
          proposal={proposalOf(card)}
          why="Pages on-call"
          context={context}
        />
      ))}
    </ToastStoreProvider>
  );
  return { node, toasts, openItem, openPlace, announce };
}

const press = (page: HTMLElement, name: string) =>
  act(async () => buttonNamed(page, name)?.click());

const articleOf = (page: HTMLElement, at = 0) => page.querySelectorAll("article")[at];

verifies("assistant.build.card-states", () => {
  describe("a decided card", () => {
    it("says Accepted 2 of 3 when the item accepted two changes and rejected the last", async () => {
      const host = filesHost(reviewOf(3));
      const shown = cards(host);
      const page = await show(shown.node);
      await act(async () => host.changed(reviewOf(1, "id: triage\nnew 0\nnew 1\n")));
      await act(async () => host.changed(null, "id: triage\nnew 0\nnew 1\n"));
      expect(page.textContent).toContain("Accepted 2 of 3");
      expect(page.textContent).toContain("Now a change in triage. Undo it in Changes ›");
      expect(page.innerHTML).not.toMatch(/success|✓/);
      expect(buttonNamed(page, "Accept all")).toBeUndefined();
      await press(page, "Changes ›");
      expect(shown.openPlace).toHaveBeenCalledWith("changes");
      expect(cardReviewsOf(host.fake.host).takeNotes("c1")).toEqual([
        `(The person accepted 2 of 3 changes to ${path} and rejected the rest.)`,
      ]);
    });

    it("says Rejected without the why, with focus on the state line", async () => {
      const host = filesHost(reviewOf(1));
      const page = await show(cards(host).node);
      await press(page, "Reject all");
      expect(page.textContent).toContain("Rejected");
      expect(page.textContent).not.toContain("Pages on-call");
      expect(document.activeElement?.textContent).toBe("Rejected");
    });

    it("says Accepted, keeps the diff, and shows the actions again after an Undo", async () => {
      const host = filesHost(reviewOf(2));
      const shown = cards(host);
      const page = await show(shown.node);
      await act(async () => host.changed(null, "id: triage\nnew 0\nnew 1\n"));
      expect(page.textContent).toContain("Accepted");
      expect(page.textContent).toContain("Show the diff");
      await act(async () => host.changed(reviewOf(2)));
      expect(buttonNamed(page, "Accept all")).toBeDefined();
      expect(cardReviewsOf(host.fake.host).takeNotes("c1")).toEqual([]);
    });

    it("says Accepted after Studio started again only when the file is as the model wrote it", async () => {
      const host = filesHost(null);
      host.changed(null, "id: triage\nnew\n");
      const page = await show(cards(host).node);
      expect(page.textContent).toContain("Accepted");
      unmount();
      const other = filesHost(null);
      const later = await show(cards(other, { chatId: "c1", cardId: "call-9" }).node);
      expect(later.textContent).not.toContain("Accepted");
    });
  });
});

verifies("assistant.build.newer-proposal-replaces-open-one", () => {
  const second: ReviewCard = { chatId: "c1", cardId: "call-2" };

  it("marks the earlier card Replaced, and Go to it focuses the newer card's Review", async () => {
    const host = filesHost(reviewOf(2));
    const shown = cards(host, first, second);
    const page = await show(shown.node);
    await act(async () => host.changed(reviewOf(2, "id: triage\n", second)));
    expect(articleOf(page, 0)?.textContent).toContain("Replaced");
    expect(articleOf(page, 0)?.textContent).toContain("A newer change to this file is below.");
    expect(shown.announce).toHaveBeenCalledWith("Replaced. A newer change to this file is below.");
    await press(page, "Go to it");
    expect(document.activeElement?.textContent).toBe("Review");
    expect(articleOf(page, 1)?.contains(document.activeElement)).toBe(true);
    expect(cardReviewsOf(host.fake.host).takeNotes("c1")).toEqual([]);
  });

  it("says when another chat made the newer change, and opens that chat", async () => {
    const host = filesHost(reviewOf(1));
    const page = await show(cards(host).node);
    const openChat = vi.spyOn(buildChatsOf(host.fake.host), "openChat").mockResolvedValue();
    await act(async () => host.changed(reviewOf(1, "id: triage\n", { chatId: "c2", cardId: "x" })));
    expect(page.textContent).toContain("A newer change to this file is in another chat.");
    await press(page, "Go to it");
    expect(openChat).toHaveBeenCalledWith("c2");
    expect(cardReviewsOf(host.fake.host).takeNotes("c1")).toEqual([
      `(Another chat changed ${path}. Its card now covers these changes.)`,
    ]);
  });

  it("keeps an accepted card Accepted when the model changes the file again", async () => {
    const host = filesHost(reviewOf(1));
    const page = await show(cards(host, first, second).node);
    await act(async () => host.changed(null, "id: triage\nnew 0\n"));
    await act(async () => host.changed(reviewOf(1, "id: triage\nnew 0\n", second)));
    expect(articleOf(page, 0)?.textContent).toContain("Accepted");
    expect(articleOf(page, 0)?.textContent).not.toContain("Replaced");
  });
});

verifies("assistant.build.card-changed-outside", () => {
  it("waits for Compare when the file changed outside Halonic, then reads Replaced", async () => {
    const host = filesHost(reviewOf(1));
    host.answer({ status: "done", step: { files: [] }, held: [path] });
    const shown = cards(host);
    const page = await show(shown.node);
    await press(page, "Accept all");
    expect(page.textContent).toContain("triage changed outside Halonic. Compare first.");
    expect(buttonNamed(page, "Accept all")?.getAttribute("aria-disabled")).toBe("true");
    expect(shown.toasts.list()).toEqual([]);
    await press(page, "Compare");
    expect(shown.openItem).toHaveBeenCalledWith({ kind: "file", hub: "workspace", id: path });
    await act(async () => host.changed(null, "id: triage\nfrom outside\n"));
    expect(page.textContent).toContain("Replaced by the version from outside Halonic.");
    expect(cardReviewsOf(host.fake.host).takeNotes("c1")).toEqual([
      `(The file ${path} was replaced by a version from outside Halonic. Your changes to it are gone.)`,
    ]);
  });

  it("reads out-of-date changes again quietly, keeping focus in the card", async () => {
    const host = filesHost(reviewOf(1));
    host.answer({ status: "stale", path });
    const shown = cards(host);
    const page = await show(shown.node);
    buttonNamed(page, "Accept all")?.focus();
    await press(page, "Accept all");
    expect(shown.toasts.list()).toEqual([]);
    expect(page.textContent).toContain("The file changed. Showing the latest changes.");
    expect(articleOf(page)?.contains(document.activeElement)).toBe(true);
  });
});
