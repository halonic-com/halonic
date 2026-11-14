// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovalItem } from "../inbox-items.ts";
import { inboxItems } from "../inbox-items.ts";
import { pendingApproval, waitingRun } from "../test-runs.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { unmountAll } from "../test-support/render.tsx";
import {
  askedAt,
  button,
  createNoteItem,
  manual,
  openCard,
  press,
} from "./approval-card.test-helper.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

verifies("inbox.approval-card", () => {
  describe("waiting", () => {
    it("is a region named by its title, which has focus", () => {
      const { root } = openCard();
      const region = root.querySelector("section");
      const title = root.querySelector("h2");
      expect(title?.textContent).toBe("Sorter wants to use create_note (notes-mcp)");
      expect(region?.getAttribute("aria-labelledby")).toBe(title?.id);
      expect(document.activeElement).toBe(title);
    });

    it("keeps counting the waiting time while it's open", () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      try {
        const { root, later } = openCard();
        later(120);
        act(() => vi.advanceTimersByTime(60_000));
        expect(root.textContent).toContain("Waiting since 10:42 (3 min)");
      } finally {
        vi.useRealTimers();
      }
    });

    it("shows since when it waits, the action and every argument, and no timer", () => {
      const { root } = openCard();
      const text = root.textContent ?? "";
      expect(text).toContain("Waiting since 10:42 (1 min)");
      expect(root.querySelector("h3")?.textContent).toBe("create_note · notes-mcp");
      expect(text).toContain("External connector (MCP)");
      expect(root.querySelector("code")?.textContent).toBe("notes-mcp__create_note");
      const fields = [...root.querySelectorAll("dl > div")].map((field) => [
        field.querySelector("dt")?.textContent,
        field.querySelector("dd")?.textContent,
      ]);
      expect(fields).toEqual([
        ["title", "Refund for Sam"],
        ["body", "(empty)"],
      ]);
      expect(text).not.toMatch(/moves on|expires|Moves on/);
      expect(root.textContent).not.toContain("Approve and send");
    });

    it("has no MCP tag for one of Halonic's own tools", () => {
      const [item] = inboxItems([
        waitingRun("r1", {
          approvals: [pendingApproval("call-1", "publish", askedAt.toISOString())],
        }),
      ]);
      const { root } = openCard({ item: item as ApprovalItem });
      expect(root.textContent).not.toContain("External connector (MCP)");
      expect(root.querySelector("h2")?.textContent).toBe("Sorter wants to use publish");
    });

    it("names the subagent that asked before the agent it asked for", () => {
      const item = { ...createNoteItem(), subagent: "checker" };
      const { root } = openCard({ item, subagentName: "Checker" });
      expect(root.querySelector("h2")?.textContent).toBe(
        "Checker, for Sorter, wants to use create_note (notes-mcp)",
      );
    });

    it("shows model output as text: a link, an image and a script stay as written", () => {
      const reply =
        "[click](https://example.com) ![x](https://example.com/x.png) <script>alert(1)</script>";
      const { root } = openCard({ item: createNoteItem({ body: reply }) });
      expect(root.querySelector("dd")?.textContent).toBe(reply);
      expect(root.querySelector("a, img, script")).toBeNull();
    });

    it("marks a hidden character and says so", () => {
      const { root } = openCard({
        item: createNoteItem({ title: `Refund${String.fromCodePoint(0x202e)}for Sam` }),
      });
      expect(root.querySelector("dd")?.textContent).toBe(
        "Refund⟦U+202E⟧for SamContains hidden or direction-changing characters",
      );
    });

    it("says a value has hidden characters when folding counts them as empty lines", () => {
      const bom = String.fromCodePoint(0xfeff);
      const { root } = openCard({
        item: createNoteItem({ body: `top${`\n${bom}`.repeat(5)}\nend` }),
      });
      const value = root.querySelector("dd")?.textContent ?? "";
      expect(value).toContain("⟦5 empty lines⟧");
      expect(value).toContain("Contains hidden or direction-changing characters");
    });

    it("marks hidden characters in the raw tool name and an argument's name", () => {
      const zwsp = String.fromCodePoint(0x200b);
      const approval = {
        ...pendingApproval("call-1", `notes-mcp__create${zwsp}note`, askedAt.toISOString()),
        args: { [`ti${zwsp}tle`]: "Refund for Sam" },
      };
      const [item] = inboxItems([waitingRun("r47", { approvals: [approval] })]);
      const { root } = openCard({ item: item as ApprovalItem });
      expect(root.querySelector("h2")?.textContent).toBe(
        "Sorter wants to use create⟦U+200B⟧note (notes-mcp)",
      );
      expect(root.querySelector("code")?.textContent).toBe("notes-mcp__create⟦U+200B⟧note");
      expect(root.querySelector("dt")?.textContent).toBe("ti⟦U+200B⟧tle");
    });

    it("folds a long argument and opens it with Show more", async () => {
      const body = Array.from({ length: 44 }, (_, index) => `line ${index + 1}`).join("\n");
      const { root } = openCard({ item: createNoteItem({ body }) });
      const fold = button(root, "Show 38 more lines");
      expect(root.querySelector("dd")?.textContent).not.toContain("line 7");
      await act(async () => fold.click());
      expect(root.querySelector("dd")?.textContent).toContain("line 44");
    });

    it("opens the raw JSON with a toggle named for the tool", async () => {
      const { root } = openCard();
      const toggle = button(root, "Show raw JSON");
      expect(toggle.textContent).toBe("Show raw JSON for create_note");
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      await act(async () => toggle.click());
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      const json = root.querySelector("pre");
      expect(json?.textContent).toBe('{\n  "title": "Refund for Sam",\n  "body": ""\n}');
      expect(json?.tabIndex).toBe(0);
    });
  });

  describe("deciding", () => {
    it("approves after the first second, then shows the decided state with focus", async () => {
      let finish = () => {};
      const { root, sent, later } = openCard({
        decisions: {
          approve: () =>
            new Promise((resolve) => {
              sent.push("approve");
              finish = () => resolve(waitingRun("r47"));
            }),
          reject: async () => waitingRun("r47"),
          askForChanges: async () => waitingRun("r47"),
        },
      });
      later(61);
      await press(button(root, "Approve"));
      expect(sent).toEqual(["approve"]);
      expect(button(root, "Approve").getAttribute("aria-busy")).toBe("true");
      expect(root.textContent).toContain("Approving…");
      await press(button(root, "Reject"));
      expect(sent).toEqual(["approve"]);
      await act(async () => finish());
      const callout = root.querySelector("[role='group']");
      expect(callout?.textContent).toContain("Approved by you at 10:44. The run continues.");
      expect(document.activeElement).toBe(callout);
      expect(root.textContent).toContain("Nothing else is waiting for you.");
      expect(root.querySelector(".border-dashed")?.textContent).toBe("create_note · notes-mcp");
      expect(root.textContent).not.toMatch(/Done|Sent|Undo/);
      // It no longer waits: the header keeps Open run, not the waiting time (flow-inbox 5.3).
      expect(root.textContent).not.toContain("Waiting since");
      expect(button(root, "Open run")).toBeDefined();
    });

    it("says the agent is told when you reject, and offers Next", async () => {
      const open = vi.fn();
      const { root, sent, later } = openCard({
        next: { title: "Approve this reply?", left: 2, open },
      });
      later(61);
      await press(button(root, "Reject"));
      expect(sent).toEqual(["reject"]);
      expect(root.textContent).toContain(
        "Rejected by you at 10:44. This tool call didn't run. The agent is told, and the run continues.",
      );
      const next = button(root, "Next");
      expect(next.textContent).toBe("Next: Approve this reply? · 2 left, 2 left");
      await press(next);
      expect(open).toHaveBeenCalledOnce();
    });

    it("offers the way back to the run you came from, also when nothing else waits", async () => {
      const open = vi.fn();
      const { root, later } = openCard({ back: { kind: "run", runName: "01JD8Q", open } });
      expect(root.textContent).not.toContain("Back to run");
      later(61);
      await press(button(root, "Approve"));
      expect(root.textContent).toContain("Nothing else is waiting for you.");
      await press(button(root, "Back to run 01JD8Q"));
      expect(open).toHaveBeenCalledOnce();
    });

    it("offers the way back to the chat you came from, next to Next", async () => {
      const back = vi.fn();
      const { root, later } = openCard({
        next: { title: "Approve this reply?", left: 2, open: () => {} },
        back: { kind: "chat", agentName: "Mailbot", open: back },
      });
      later(61);
      await press(button(root, "Reject"));
      const labels = [...root.querySelectorAll("button")].map((b) => b.textContent);
      expect(labels.slice(-2)).toEqual([
        "Back to the chat with Mailbot",
        "Next: Approve this reply? · 2 left, 2 left",
      ]);
      await press(button(root, "Back to the chat"));
      expect(back).toHaveBeenCalledOnce();
    });

    it("ignores a press in the first second, and lets a screen reader's click through", async () => {
      const { root, sent } = openCard();
      await press(button(root, "Approve"));
      expect(sent).toEqual([]);
      await act(async () => button(root, "Approve").click());
      expect(sent).toEqual(["approve"]);
    });

    it("ignores a key that is held or repeats", async () => {
      const { root, sent, later } = openCard();
      later(5);
      const approve = button(root, "Approve");
      await act(async () => {
        approve.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", repeat: true, bubbles: true }),
        );
        approve.click();
      });
      expect(sent).toEqual([]);
    });

    it("keeps the card when the decision can't be recorded, with Try again", async () => {
      let fail = true;
      const { root, sent, later } = openCard({
        decisions: {
          approve: async () => waitingRun("r47"),
          reject: async () => {
            sent.push("reject");
            if (fail) throw new Error("engine gone");
            return waitingRun("r47");
          },
          askForChanges: async () => waitingRun("r47"),
        },
      });
      later(2);
      await press(button(root, "Reject"));
      const slot = root.querySelector("[role='alert']");
      expect(slot?.textContent).toBe("Couldn't record your decision.Try again");
      expect(button(root, "Approve")).toBeDefined();
      fail = false;
      await press(button(root, "Try again"));
      expect(sent).toEqual(["reject", "reject"]);
      expect(root.textContent).toContain("Rejected by you at");
    });

    it("shows the command to copy, with no Try again, when only the command line can answer", async () => {
      const { root, later } = openCard({
        decisions: {
          approve: async () => {
            throw manual();
          },
          reject: async () => waitingRun("r47"),
          askForChanges: async () => waitingRun("r47"),
        },
      });
      later(2);
      await press(button(root, "Approve"));
      const slot = root.querySelector("[role='alert']");
      expect(slot?.textContent).toContain("Studio can't answer runs yet.");
      expect(slot?.querySelector("code, [class*='font-mono']")?.textContent).toBe(
        "halonic runs send 7k2m9p approve",
      );
      expect(root.querySelector("button[aria-label='Copy command']")).not.toBeNull();
      expect(root.textContent).not.toContain("Try again");
      expect(root.textContent).not.toContain("Couldn't record your decision.");
      expect(button(root, "Approve")).toBeDefined();
    });

    it("opens the run", async () => {
      const onOpenRun = vi.fn();
      const { root } = openCard({ onOpenRun });
      await press(button(root, "Open run"));
      expect(onOpenRun).toHaveBeenCalledWith("r47");
    });
  });
});
