// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WaitItem } from "../inbox-items.ts";
import { inboxItems } from "../inbox-items.ts";
import { waitingRun } from "../test-runs.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { answerLabel, WaitCard, type WaitCardProps } from "./wait-card.tsx";

afterEach(unmountAll);

// Local times, so the test reads the same in every time zone. Tue 10 Nov 2026.
const waitingSinceAt = new Date(2026, 10, 10, 10, 40);

function reviewItem(fields: Parameters<typeof waitingRun>[1] = {}): WaitItem {
  const [item] = inboxItems([
    waitingRun("r43", {
      waitingFor: {
        title: "Approve this reply?",
        body: "Hi Sam, your refund is on its way.\nSee [our policy](https://evil.example) <script>alert(1)</script>",
      },
      lastWaitingAt: waitingSinceAt.toISOString(),
      ...fields,
    }),
  ]);
  if (item?.kind !== "wait") throw new Error("expected a wait item");
  return item;
}

function openCard(overrides: Partial<WaitCardProps> = {}) {
  const clock = { now: new Date(2026, 10, 10, 10, 43) };
  const sent: string[] = [];
  const props: WaitCardProps = {
    item: reviewItem(),
    decisions: {
      answer: async (_item, event) => {
        sent.push(event);
        return waitingRun("r43");
      },
    },
    onOpenRun: () => {},
    next: null,
    back: null,
    now: () => clock.now,
    ...overrides,
  };
  const root = render(<WaitCard {...props} />);
  const later = (seconds: number) => {
    clock.now = new Date(clock.now.getTime() + seconds * 1000);
  };
  return { root, sent, later };
}

function button(root: HTMLElement, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((b) => b.textContent?.startsWith(name));
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

async function press(target: HTMLElement) {
  await act(async () => {
    target.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    target.click();
  });
}

verifies("inbox.wait-card", () => {
  describe("waiting", () => {
    it("is a region named by the step's first line, which has focus", () => {
      const { root } = openCard();
      const title = root.querySelector("h2");
      expect(title?.textContent).toBe("Approve this reply?");
      expect(root.querySelector("section")?.getAttribute("aria-labelledby")).toBe(title?.id);
      expect(document.activeElement).toBe(title);
      expect(root.textContent).toContain("Waiting since 10:40 (3 min)");
    });

    it("shows the body as plain text: no link, no image, no HTML", () => {
      const { root } = openCard();
      const body = root.querySelector("bdi");
      expect(body?.textContent).toBe(
        "Hi Sam, your refund is on its way.\nSee [our policy](https://evil.example) <script>alert(1)</script>",
      );
      expect(root.querySelector("a, img, script")).toBeNull();
    });

    it("marks a hidden character a filled-in value put in the title", () => {
      const { root } = openCard({
        item: reviewItem({
          waitingFor: { title: `Approve ${String.fromCodePoint(0x202e)}Sam?`, body: "" },
        }),
      });
      expect(root.querySelector("h2")?.textContent).toBe("Approve ⟦U+202E⟧Sam?");
    });

    it("has no body when the step has only its first line", () => {
      const { root } = openCard({
        item: reviewItem({ waitingFor: { title: "Approve this reply?", body: "" } }),
      });
      expect(root.querySelector("bdi")).toBeNull();
    });

    it("says when a timer moves it on, and nothing without one", () => {
      const timed = openCard({
        item: reviewItem({ nextTimer: new Date(2026, 10, 9, 14, 0).toISOString() }),
      });
      expect(timed.root.textContent).toContain("Moves on by itself on Mon 9 Nov, 14:00.");
      unmountAll();
      const { root } = openCard();
      expect(root.textContent).not.toMatch(/Moves on|expires/);
    });

    it("has a button per answer, the first one primary and none red", () => {
      const { root } = openCard({
        item: reviewItem({ accepts: ["approve", "reject", "needs_info"] }),
      });
      const labels = [...root.querySelectorAll("button")].map((b) => b.textContent);
      // Each button also holds its busy label, hidden, so it keeps its width while busy.
      expect(labels).toEqual([
        "Open run",
        "ApproveApproving…",
        "RejectRejecting…",
        "Needs infoWorking…",
      ]);
      expect(root.innerHTML).not.toContain("danger");
    });
  });

  describe("answering", () => {
    it("approves after the first second, then shows the answered state with focus", async () => {
      const { root, sent, later } = openCard();
      later(61);
      await press(button(root, "Approve"));
      expect(sent).toEqual(["approve"]);
      const callout = root.querySelector("[role='group']");
      expect(callout?.textContent).toContain("Approved by you at 10:44. The run continues.");
      expect(document.activeElement).toBe(callout);
      expect(root.querySelector(".border-dashed")?.textContent).toContain("Hi Sam");
      expect(root.textContent).toContain("Nothing else is waiting for you.");
      expect(root.textContent).not.toContain("Waiting since");
      expect(button(root, "Open run")).toBeDefined();
    });

    it("says only who rejected and when, for the step's own reject", async () => {
      const { root, later } = openCard();
      later(181);
      await press(button(root, "Reject"));
      expect(root.querySelector("[role='group']")?.textContent).toContain(
        "Rejected by you at 10:46.",
      );
      expect(root.textContent).not.toContain("tool call");
    });

    it("names any other answer you chose", async () => {
      const { root, sent, later } = openCard({
        item: reviewItem({ accepts: ["approve", "escalate"] }),
      });
      later(61);
      await press(button(root, "Escalate"));
      expect(sent).toEqual(["escalate"]);
      expect(root.textContent).toContain("You chose Escalate at 10:44.");
    });

    it("ignores a press in the first second, and lets a screen reader's click through", async () => {
      const { root, sent } = openCard();
      await press(button(root, "Approve"));
      expect(sent).toEqual([]);
      await act(async () => button(root, "Approve").click());
      expect(sent).toEqual(["approve"]);
    });

    it("keeps the card when the answer can't be recorded, with Try again", async () => {
      let fail = true;
      const sent: string[] = [];
      const { root, later } = openCard({
        decisions: {
          answer: async (_item, event) => {
            sent.push(event);
            if (fail) throw new Error("engine gone");
            return waitingRun("r43");
          },
        },
      });
      later(2);
      await press(button(root, "Reject"));
      expect(root.querySelector("[role='alert']")?.textContent).toBe(
        "Couldn't record your decision.Try again",
      );
      fail = false;
      await press(button(root, "Try again"));
      expect(sent).toEqual(["reject", "reject"]);
      expect(root.textContent).toContain("Rejected by you at");
    });

    it("offers the way back to the run you came from once answered", async () => {
      const open = vi.fn();
      const { root, later } = openCard({ back: { kind: "run", runName: "01JD8Q", open } });
      expect(root.textContent).not.toContain("Back to run");
      later(61);
      await press(button(root, "Approve"));
      expect(root.textContent).toContain("Nothing else is waiting for you.");
      await press(button(root, "Back to run 01JD8Q"));
      expect(open).toHaveBeenCalledOnce();
    });

    it("uses the button's word in the decided line: the step's own label, else the built-in one", async () => {
      const item: WaitItem = {
        ...reviewItem({ accepts: ["approve", "needs_info", "escalate"] }),
        answerLabels: { approve: "Send reply", escalate: "Ask a lead" },
      };
      const words = { approve: "Send reply", needs_info: "Needs info", escalate: "Ask a lead" };
      for (const [event, word] of Object.entries(words)) {
        unmountAll();
        const { root, sent, later } = openCard({ item });
        later(61);
        await press(button(root, word));
        expect(sent).toEqual([event]);
        expect(root.querySelector("[role='group']")?.textContent).toContain(
          `You chose ${word} at 10:44.`,
        );
      }
    });

    it("keeps the built-in lines for Approve and Reject when the step has no label", async () => {
      const { root, later } = openCard({
        item: { ...reviewItem(), answerLabels: { escalate: "Ask a lead" } },
      });
      later(61);
      await press(button(root, "Approve"));
      expect(root.textContent).toContain("Approved by you at 10:44. The run continues.");
    });

    it("says Working… while sending an answer the step labels itself, never another word", () => {
      const { root } = openCard({
        item: { ...reviewItem(), answerLabels: { approve: "Send reply" } },
      });
      const labels = [...root.querySelectorAll("button")].map((b) => b.textContent);
      expect(labels).toEqual(["Open run", "Send replyWorking…", "RejectRejecting…"]);
    });

    it("takes an answer named like a built-in object key", async () => {
      const item: WaitItem = {
        ...reviewItem({ accepts: ["constructor", "toString"] }),
        answerLabels: { toString: "Show text" },
      };
      const { root, sent, later } = openCard({ item });
      const labels = [...root.querySelectorAll("button")].map((b) => b.textContent);
      expect(labels).toEqual(["Open run", "ConstructorWorking…", "Show textWorking…"]);
      later(61);
      await press(button(root, "Constructor"));
      expect(sent).toEqual(["constructor"]);
      expect(root.textContent).toContain("You chose Constructor at 10:44.");
    });

    it("opens the run", async () => {
      const onOpenRun = vi.fn();
      const { root } = openCard({ onOpenRun });
      await press(button(root, "Open run"));
      expect(onOpenRun).toHaveBeenCalledWith("r43");
    });
  });

  it("names an answer in words", () => {
    expect(answerLabel("approve")).toBe("Approve");
    expect(answerLabel("needs_info")).toBe("Needs info");
    expect(answerLabel("ask-again")).toBe("Ask again");
    expect(answerLabel("escalate", "Ask a lead")).toBe("Ask a lead");
    expect(answerLabel("escalate", "  ")).toBe("Escalate");
    expect(answerLabel("escalate", `Ask ${String.fromCodePoint(0x202e)}lead`)).toBe(
      "Ask ⟦U+202E⟧lead",
    );
  });
});
