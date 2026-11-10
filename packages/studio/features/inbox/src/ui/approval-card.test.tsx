// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovalItem } from "../inbox-items.ts";
import { inboxItems } from "../inbox-items.ts";
import { pendingApproval, waitingRun } from "../test-runs.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ApprovalCard, type ApprovalCardProps } from "./approval-card.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

// Local times, so the test reads the same in every time zone. Sun 8 Nov 2026.
const askedAt = new Date(2026, 10, 8, 10, 42);

function createNoteItem(args: unknown = { title: "Refund for Sam", body: "" }): ApprovalItem {
  const approval = {
    ...pendingApproval("call-1", "notes-mcp__create_note", askedAt.toISOString()),
    args,
  };
  const [item] = inboxItems([waitingRun("r47", { approvals: [approval] })]);
  if (item?.kind !== "approval") throw new Error("expected an approval item");
  return item;
}

/** A clock the test moves, and a card on it. */
function openCard(overrides: Partial<ApprovalCardProps> = {}) {
  const clock = { now: new Date(2026, 10, 8, 10, 43) };
  const sent: string[] = [];
  const props: ApprovalCardProps = {
    item: createNoteItem(),
    agentName: "Sorter",
    decisions: {
      approve: async () => {
        sent.push("approve");
        return waitingRun("r47");
      },
      reject: async () => {
        sent.push("reject");
        return waitingRun("r47");
      },
      askForChanges: async (_item, note) => {
        sent.push(`note: ${note}`);
        return waitingRun("r47");
      },
    },
    onOpenRun: () => {},
    next: null,
    now: () => clock.now,
    ...overrides,
  };
  const root = render(<ApprovalCard {...props} />);
  const later = (seconds: number) => {
    clock.now = new Date(clock.now.getTime() + seconds * 1000);
  };
  return { root, sent, clock, later };
}

function button(root: HTMLElement, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((b) => b.textContent?.startsWith(name));
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

/** A real pointer press: a press, then the click. */
async function press(target: HTMLElement) {
  await act(async () => {
    target.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    target.click();
  });
}

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

    it("opens the run", async () => {
      const onOpenRun = vi.fn();
      const { root } = openCard({ onOpenRun });
      await press(button(root, "Open run"));
      expect(onOpenRun).toHaveBeenCalledWith("r47");
    });
  });

  describe("asking for changes", () => {
    function noteField(): HTMLTextAreaElement {
      const field = document.querySelector<HTMLTextAreaElement>("dialog textarea");
      if (field === null) throw new Error("no note field");
      return field;
    }

    async function type(text: string) {
      await act(async () => {
        const field = noteField();
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
        setter?.call(field, text);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }

    function dialogButton(name: string): HTMLButtonElement {
      const dialog = document.querySelector("dialog");
      if (dialog === null) throw new Error("no dialog");
      return button(dialog as HTMLElement, name);
    }

    it("opens a dialog with the note focused, and sends it as the decision", async () => {
      const { root, sent, later } = openCard();
      later(61);
      await press(button(root, "Ask for changes"));
      expect(document.querySelector("dialog h2")?.textContent).toBe("Ask for changes");
      expect(document.activeElement).toBe(noteField());
      await type("Use the shorter title");
      await press(dialogButton("Send note"));
      expect(sent).toEqual(["note: Use the shorter title"]);
      expect(document.querySelector("dialog")).toBeNull();
      const callout = root.querySelector("[role='group']");
      expect(callout?.textContent).toContain(
        "Note sent to the agent at 10:44: Use the shorter title",
      );
      expect(document.activeElement).toBe(callout);
    });

    it("shows the sent note as text: a link and a script stay as written", async () => {
      const { root, later } = openCard();
      later(61);
      const note = "See [the docs](https://example.com) <script>alert(1)</script>";
      await press(button(root, "Ask for changes"));
      await type(note);
      await press(dialogButton("Send note"));
      const callout = root.querySelector("[role='group']");
      expect(callout?.textContent).toContain(`Note sent to the agent at 10:44: ${note}`);
      expect(callout?.querySelector("a, script")).toBeNull();
    });

    it("folds a long sent note behind Show more", async () => {
      const { root, later } = openCard();
      later(61);
      await press(button(root, "Ask for changes"));
      await type(Array.from({ length: 44 }, (_, index) => `line ${index + 1}`).join("\n"));
      await press(dialogButton("Send note"));
      const callout = root.querySelector<HTMLElement>("[role='group']");
      if (callout === null) throw new Error("no decided Callout");
      expect(callout.textContent).not.toContain("line 7");
      await act(async () => button(callout, "Show 38 more lines").click());
      expect(callout.textContent).toContain("line 44");
    });

    it("says what's missing for an empty note, and sends nothing", async () => {
      const { root, sent, later } = openCard();
      later(2);
      await press(button(root, "Ask for changes"));
      await press(dialogButton("Send note"));
      expect(sent).toEqual([]);
      expect(document.querySelector("dialog")?.textContent).toContain("Say what should change.");
      expect(document.activeElement).toBe(noteField());
      expect(noteField().getAttribute("aria-invalid")).toBe("true");
    });

    it("keeps the dialog and the note when the note can't be sent", async () => {
      const { root, later } = openCard({
        decisions: {
          approve: async () => waitingRun("r47"),
          reject: async () => waitingRun("r47"),
          askForChanges: async () => {
            throw new Error("engine gone");
          },
        },
      });
      later(2);
      await press(button(root, "Ask for changes"));
      await type("Use the shorter title");
      await press(dialogButton("Send note"));
      // The dialog's alert slot fills a frame after the request ends, so the failure is read.
      await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      expect(document.querySelector("dialog")?.textContent).toContain(
        "Couldn't record your decision.",
      );
      expect(noteField().value).toBe("Use the shorter title");
    });

    it("keeps the note after Cancel, for the next time it opens", async () => {
      const { root, later } = openCard();
      later(2);
      await press(button(root, "Ask for changes"));
      await type("Use the shorter title");
      await press(dialogButton("Cancel"));
      expect(document.querySelector("dialog")).toBeNull();
      await press(button(root, "Ask for changes"));
      expect(noteField().value).toBe("Use the shorter title");
    });

    it("doesn't open in the first second", async () => {
      const { root } = openCard();
      await press(button(root, "Ask for changes"));
      expect(document.querySelector("dialog")).toBeNull();
    });
  });
});
