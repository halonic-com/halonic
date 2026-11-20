// @vitest-environment jsdom
import { KindedError } from "@halonicjs/std";
import { engineWords } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WaitItem } from "../inbox-items.ts";
import { waitingRun } from "../test-runs.test-helper.ts";
import { unmountAll } from "../test-support/render.tsx";
import { button, openCard, press, reviewItem } from "./wait-card.test-helper.tsx";
import { answerLabel } from "./wait-card.tsx";

afterEach(unmountAll);

/**
 * A button's accessible name, as far as these buttons need it: its `aria-label`, else the text a
 * screen reader reads, leaving out what's hidden (the busy label while not busy).
 */
function accessibleName(target: HTMLElement): string {
  const label = target.getAttribute("aria-label");
  if (label !== null) return label;
  const read = (node: Node): string => {
    if (node instanceof HTMLElement) {
      if (node.classList.contains("invisible") || node.getAttribute("aria-hidden") === "true") {
        return "";
      }
      return [...node.childNodes].map(read).join("");
    }
    return node.textContent ?? "";
  };
  return read(target);
}

verifies("inbox.wait-card", () => {
  describe("waiting", () => {
    it("lets the answers follow the step in a short window, so the step gets the room (HAL-12665)", () => {
      const { root } = openCard();
      const card = root.querySelector("section") as HTMLElement;
      const [body, bar] = [...card.children] as HTMLElement[];
      expect(card.className).toContain("min-h-0 flex-col short:min-h-auto");
      expect(body?.className).toContain("overflow-y-auto p-4 short:overflow-visible");
      expect(bar?.textContent).toContain("Approve");
    });

    it("is a region named by the step's first line, which has focus", () => {
      const { root } = openCard();
      const title = root.querySelector("h2");
      expect(title?.textContent).toBe("Approve this reply?");
      expect(root.querySelector("section")?.getAttribute("aria-labelledby")).toBe(title?.id);
      expect(document.activeElement).toBe(title);
      expect(root.textContent).toContain("Waiting since 10:40 (3 min)");
    });

    // jsdom lays nothing out, so this holds the classes that do it: the header wraps, its text
    // asks for 10rem, and Open run sits after it on the right (HAL-14006).
    it("puts Open run on a line under the title when the card is too narrow", () => {
      const { root } = openCard();
      const header = root.querySelector("header");
      const text = root.querySelector("h2")?.parentElement;
      expect(header?.className).toContain("flex-wrap");
      expect(text?.parentElement).toBe(header);
      expect(text?.className).toContain("basis-40");
      const openRun = button(root, "Open run").parentElement;
      expect(openRun?.parentElement).toBe(header);
      expect(openRun?.className).toContain("ml-auto");
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

  describe("while the engine isn't answering", () => {
    it("shows the last-said line and keeps the answers focusable but still", async () => {
      const { root, sent, later } = openCard({
        item: reviewItem({ accepts: ["approve", "reject"] }),
        answering: false,
      });
      later(2);
      const line = root.querySelector("p[id]");
      expect(line?.textContent).toBe(engineWords["desktop-app"].showingLast);
      for (const name of ["Approve", "Reject"]) {
        const target = button(root, name);
        expect(target.getAttribute("aria-disabled")).toBe("true");
        expect(target.getAttribute("aria-describedby")).toContain(line?.id);
        expect(target.disabled).toBe(false);
        await press(target);
      }
      expect(sent).toEqual([]);
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

    it("says the run finished when the approve finished it (HAL-13919)", async () => {
      const { root, later } = openCard({
        decisions: { answer: async () => waitingRun("r43", { status: "completed" }) },
      });
      later(61);
      await press(button(root, "Approve"));
      expect(root.querySelector("[role='group']")?.textContent).toContain(
        "Approved by you at 10:44. The run finished.",
      );
      expect(root.textContent).not.toContain("continues");
    });

    it("says neither continues nor finished when the approve ended the run another way", async () => {
      const { root, later } = openCard({
        decisions: { answer: async () => waitingRun("r43", { status: "failed" }) },
      });
      later(61);
      await press(button(root, "Approve"));
      const decided = root.querySelector("[role='group']")?.textContent ?? "";
      expect(decided).toContain("Approved by you at 10:44.");
      expect(decided).not.toMatch(/continues|finished/);
    });

    it("says only who rejected and when, also when the reject finished the run", async () => {
      const { root, later } = openCard({
        decisions: { answer: async () => waitingRun("r43", { status: "completed" }) },
      });
      later(61);
      await press(button(root, "Reject"));
      const decided = root.querySelector("[role='group']")?.textContent ?? "";
      expect(decided).toContain("Rejected by you at 10:44.");
      expect(decided).not.toMatch(/continues|finished/);
    });

    it("brings the answered line and what follows it into view, in a short window too (HAL-13918)", async () => {
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      try {
        const { root, later } = openCard();
        later(2);
        await press(button(root, "Approve"));
        const bar = root.querySelector("[role='group']")?.parentElement;
        expect(bar?.textContent).toContain("Nothing else is waiting for you.");
        expect(scrollIntoView.mock.contexts).toEqual([bar]);
        expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
      } finally {
        delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
      }
    });

    it("closes cleanly when scrollIntoView returns a promise, as it does in Chromium (HAL-13918)", async () => {
      // React keeps whatever an effect returns as its clean-up, and a promise isn't a function.
      Element.prototype.scrollIntoView = () => Promise.resolve();
      try {
        const { root, later } = openCard();
        later(2);
        await press(button(root, "Approve"));
        expect(root.querySelector("[role='group']")).not.toBeNull();
        expect(unmountAll).not.toThrow();
      } finally {
        delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
      }
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

    it("says Decided elsewhere with Open run, not Try again, when the engine refuses the answer", async () => {
      const onOpenRun = vi.fn();
      const { root, later } = openCard({
        onOpenRun,
        decisions: {
          answer: async () => {
            throw new Error("engine.decision-wait-must-match");
          },
        },
      });
      later(2);
      await press(button(root, "Reject"));
      const slot = root.querySelector("[role='alert']") as HTMLElement;
      expect(slot.textContent).toContain(
        "This is no longer waiting for you. It was answered somewhere else or the run moved on.",
      );
      expect(slot.textContent).not.toContain("Try again");
      expect(slot.textContent).not.toContain("Couldn't record your decision.");
      await act(async () => button(slot, "Open run").click());
      expect(onOpenRun).toHaveBeenCalledWith("r43");
    });

    it("shows the command to copy, with no Try again, when only the command line can answer", async () => {
      const { root, later } = openCard({
        decisions: {
          answer: async () => {
            throw new KindedError("unavailable", "Studio can't answer runs yet.", {
              fix: "halonic runs send 7k2m9p reject",
            });
          },
        },
      });
      later(2);
      await press(button(root, "Reject"));
      const text = root.querySelector("[role='alert']")?.textContent ?? "";
      expect(text).toContain("Studio can't answer runs yet.");
      expect(text).toContain("halonic runs send 7k2m9p reject");
      expect(root.querySelector("button[aria-label='Copy command']")).not.toBeNull();
      expect(root.textContent).not.toContain("Try again");
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

    it("says the run continues after an approve the step labels itself", async () => {
      const { root, sent, later } = openCard({
        item: { ...reviewItem(), answerLabels: { approve: "Send reply" } },
      });
      later(61);
      await press(button(root, "Send reply"));
      expect(sent).toEqual(["approve"]);
      expect(root.querySelector("[role='group']")?.textContent).toContain(
        "You chose Send reply at 10:44. The run continues.",
      );
    });

    it("says only what you chose and when, for a reject the step labels itself", async () => {
      const { root, sent, later } = openCard({
        item: { ...reviewItem(), answerLabels: { reject: "Don't send" } },
      });
      later(61);
      await press(button(root, "Don't send"));
      expect(sent).toEqual(["reject"]);
      const decided = root.querySelector("[role='group']")?.textContent ?? "";
      expect(decided).toContain("You chose Don't send at 10:44.");
      expect(decided).not.toMatch(/continues|tool call|agent/);
    });

    it("doesn't say the run continues after any other answer", async () => {
      const { root, later } = openCard({
        item: {
          ...reviewItem({ accepts: ["approve", "escalate"] }),
          answerLabels: { escalate: "Ask a lead" },
        },
      });
      later(61);
      await press(button(root, "Ask a lead"));
      expect(root.textContent).toContain("You chose Ask a lead at 10:44.");
      expect(root.textContent).not.toContain("continues");
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

    it("ends a long label with an ellipsis on one line, named and shown in full", async () => {
      const long =
        "Send the reply to the customer now and close the ticket, then tell the account manager";
      const { root, later } = openCard({
        item: { ...reviewItem(), answerLabels: { approve: long } },
      });
      const sendButton = button(root, long);
      expect(accessibleName(sendButton)).toBe(long);
      const shown = sendButton.querySelector(".truncate");
      expect(shown?.textContent).toBe(long);
      expect(shown?.className).toContain("max-w-[calc(100cqw-2rem-2px)]");
      const tooltips = [...root.querySelectorAll("[role='tooltip']")];
      expect(tooltips.map((t) => t.textContent)).toContain(long);
      // The tooltip is the button's name, so a screen reader doesn't hear it twice.
      expect(sendButton.hasAttribute("aria-describedby")).toBe(false);
      later(61);
      await press(sendButton);
      expect(root.querySelector("[role='group']")?.textContent).toContain(
        `You chose ${long} at 10:44. The run continues.`,
      );
    });

    it("opens the run", async () => {
      const onOpenRun = vi.fn();
      const { root } = openCard({ onOpenRun });
      await press(button(root, "Open run"));
      expect(onOpenRun).toHaveBeenCalledWith("r43");
    });
  });

  describe("an answer's tooltip", () => {
    beforeEach(() => {
      HTMLElement.prototype.showPopover = vi.fn();
      HTMLElement.prototype.hidePopover = vi.fn();
    });
    afterEach(() => {
      Reflect.deleteProperty(HTMLElement.prototype, "showPopover");
      Reflect.deleteProperty(HTMLElement.prototype, "hidePopover");
    });

    /** Gives the button's label a width, then focuses the button as the keyboard would. */
    function focusWithLabel(target: HTMLButtonElement, widths: { full: number; shown: number }) {
      const label = target.querySelector(".truncate") as HTMLElement;
      Object.defineProperty(label, "scrollWidth", { configurable: true, value: widths.full });
      Object.defineProperty(label, "clientWidth", { configurable: true, value: widths.shown });
      vi.spyOn(target, "matches").mockImplementation((selector) => selector === ":focus-visible");
      act(() => target.focus());
    }

    it("doesn't repeat a label the button shows in full", () => {
      const { root } = openCard();
      focusWithLabel(button(root, "Approve"), { full: 60, shown: 60 });
      expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
    });

    it("shows the whole label when the button cuts it off", () => {
      const { root } = openCard();
      focusWithLabel(button(root, "Approve"), { full: 200, shown: 120 });
      expect(HTMLElement.prototype.showPopover).toHaveBeenCalledOnce();
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
