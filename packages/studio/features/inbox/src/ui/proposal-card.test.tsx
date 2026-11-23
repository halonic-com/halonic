// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProposalDecided, ProposalDecisions } from "../proposal-decisions.ts";
import { unmountAll } from "../test-support/render.tsx";
import {
  buttons,
  press,
  proposal,
  renderCard,
  shownText,
  wrote,
} from "./proposal-card.test-helper.tsx";

afterEach(() => {
  unmountAll();
});

function fakeDecisions(overrides: Partial<ProposalDecisions> = {}) {
  return {
    accept: vi.fn(async () => wrote("u1")),
    reject: vi.fn(async () => wrote("u2")),
    undo: vi.fn(async () => ({ leftAlone: [] as readonly string[], decidedAfter: false })),
    settle: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    ...overrides,
  } satisfies ProposalDecisions;
}

function open(decisions: ProposalDecisions | undefined, item = proposal()) {
  const onDecided = vi.fn();
  return { ...renderCard(decisions, item, onDecided), onDecided };
}

verifies("inbox.proposal-page", () => {
  describe("in a window that can't decide", () => {
    it("has no Accept or Reject, and ends with the command that shows the proposal", () => {
      const { root } = open(undefined);
      expect(buttons(root, "Accept all")).toEqual([]);
      expect(buttons(root, "Accept")).toEqual([]);
      expect(buttons(root, "Reject")).toEqual([]);
      expect(root.textContent).toContain(
        "Studio can't accept or reject these changes here. To see them and decide, use the desktop app, or run this in a terminal on your computer:",
      );
      expect(root.querySelector("code")?.textContent).toBe("halonic proposals show 01JD8Q");
      expect(root.querySelector('button[aria-label="Copy command"]')).not.toBeNull();
    });

    it("names no command once nothing is left to decide", () => {
      const decided = proposal({
        files: [{ path: "notes/a.md", change: "modified", decision: "accepted" }],
      });
      const { root } = open(undefined, decided);
      expect(root.textContent).not.toContain("run this in a terminal");
      expect(root.querySelector("code")).toBeNull();
    });
  });

  describe("before any decision", () => {
    it("says the workflow, when the run ended and what started it, with Reject all and Accept all", () => {
      const { root } = open(fakeDecisions());
      expect(root.querySelector("h2")?.textContent).toBe(
        "Run 01JD8Q proposes 2 changes to Support triage",
      );
      expect(root.querySelector("h2 + p")?.textContent).toBe(
        "Support triage · Finished at 06:12 · Started by a schedule",
      );
      expect(buttons(root, "Reject all")[0]?.className).not.toContain("danger");
      expect(buttons(root, "Accept all")).toHaveLength(1);
      expect(root.querySelector("section")?.firstElementChild?.className).toContain("p-4");
    });

    it("says what accepting does before the changes, and first that an unfinished run's may be incomplete", () => {
      const { root } = open(fakeDecisions(), proposal({ ending: "failed" }));
      const text = root.textContent ?? "";
      const incomplete = text.indexOf(
        "Run 01JD8Q didn't finish, so these changes may be incomplete.",
      );
      const outside = text.indexOf(
        "Accepting changes the files. It doesn't take back or redo what run 01JD8Q did outside them, such as messages it sent.",
      );
      expect(incomplete).toBeGreaterThan(-1);
      expect(outside).toBeGreaterThan(incomplete);
      expect(text.indexOf("notes/a.md changed")).toBeGreaterThan(outside);
      expect(text).toContain("See run 01JD8Q");
    });

    // C667 #1: the kit allows one primary per view, and flow-inbox 5.6 draws a change's buttons as words.
    it("has Accept all as its one primary button, and each change's Reject and Accept as plain words", () => {
      const { root } = open(fakeDecisions());
      const primary = [...root.querySelectorAll("button")].filter((b) =>
        b.classList.contains("bg-primary"),
      );
      expect(primary.map((b) => shownText(b))).toEqual(["Accept all"]);
      for (const button of [...buttons(root, "Accept"), ...buttons(root, "Reject")]) {
        expect(button.className).toContain("text-fg-muted");
        expect(button.className).not.toContain("border-border-strong");
      }
    });

    // C667 #2: at 720 and 360 the line shrank beside its buttons and broke paths mid-word.
    it("keeps each change's line at least 16 rem wide, so its buttons wrap under it", () => {
      const { root } = open(fakeDecisions());
      const line = root.querySelector("li span");
      expect(line?.textContent).toBe("notes/a.md changed");
      expect(line?.classList.contains("basis-64")).toBe(true);
    });

    // C678 #2: at 360 a long path broke as "…/agents/tri | age.agent.yaml".
    it("lets a long path wrap before each / first, and inside a name only when it must", () => {
      const path = "hubs/support/workflows/triage/agents/triage.agent.yaml";
      const item = proposal({ files: [{ path, change: "modified", decision: "undecided" }] });
      const { root } = open(fakeDecisions(), item);
      const line = root.querySelector("li span");
      expect(line?.textContent).toBe(`${path} changed`);
      expect(line?.querySelectorAll("wbr")).toHaveLength(5);
      expect(line?.innerHTML).toContain("<wbr>/triage.agent.yaml changed");
      expect(line?.classList.contains("wrap-break-word")).toBe(true);
    });

    // C667 #3: flow-inbox 5.6 point 2, "a plain line in text-small fg-muted".
    it("says what accepting does in small muted text, the See run link with it", () => {
      const { root } = open(fakeDecisions());
      const seeRun = buttons(root, "See run 01JD8Q ›")[0];
      const block = seeRun?.closest(".flex-col");
      expect(block?.classList.contains("text-small")).toBe(true);
      expect(block?.classList.contains("text-fg-muted")).toBe(true);
    });
  });

  describe("deciding", () => {
    it("accepts one change, announces it, moves focus on and offers Undo", async () => {
      const decisions = fakeDecisions();
      const { root, toasts, onDecided } = open(decisions);

      await press(buttons(root, "Accept")[0]);

      expect(decisions.accept).toHaveBeenCalledWith("run_mfx3k2a1_0001JD8Q", {
        file: "notes/a.md",
      });
      expect(root.querySelector("li")?.textContent).toContain("Accepted");
      expect(root.querySelector('[role="status"]')?.textContent).toBe(
        "Accepted: notes/a.md changed",
      );
      expect(document.activeElement).toBe(buttons(root, "Accept")[0]);
      expect(root.querySelectorAll("li")[1]?.contains(document.activeElement)).toBe(true);
      expect(onDecided).toHaveBeenCalled();
      const [toast] = toasts.list();
      expect(toast?.title).toBe("Accepted 1 change from run 01JD8Q");

      await act(async () => toast?.action?.onClick());

      expect(decisions.undo).toHaveBeenCalledWith("u1");
      expect(buttons(root, "Accept")).toHaveLength(2);
    });

    it("rejects all that is undecided as one step, and focuses what the proposal came to", async () => {
      const decisions = fakeDecisions();
      const { root, toasts } = open(decisions);

      await press(buttons(root, "Reject all")[0]);

      expect(decisions.reject).toHaveBeenCalledWith("run_mfx3k2a1_0001JD8Q", "all");
      expect(toasts.list().map((toast) => toast.title)).toEqual([
        "Rejected 2 changes from run 01JD8Q",
      ]);
      expect(buttons(root, "Accept")).toHaveLength(0);
      expect(document.activeElement?.textContent).toBe("Rejected");
    });

    it("keeps the pressed button busy, and the others ignore presses meanwhile", async () => {
      let answer: (decided: ProposalDecided) => void = () => {};
      const decisions = fakeDecisions({
        accept: vi.fn(() => new Promise<ProposalDecided>((resolve) => (answer = resolve))),
      });
      const { root } = open(decisions);

      await press(buttons(root, "Accept")[0]);
      await press(buttons(root, "Reject")[1]);

      expect(root.querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(decisions.reject).not.toHaveBeenCalled();
      await act(async () => answer(wrote("u1")));
    });

    // C667 #4: Q6, "the others ignore presses but stay focusable (aria-disabled)".
    it("marks the other buttons aria-disabled while a decision is sent, not disabled, and pointing at the busy one", async () => {
      let answer: (decided: ProposalDecided) => void = () => {};
      const decisions = fakeDecisions({
        accept: vi.fn(() => new Promise<ProposalDecided>((resolve) => (answer = resolve))),
      });
      const { root } = open(decisions);

      await press(buttons(root, "Accept")[0]);

      const busy = root.querySelector<HTMLButtonElement>('[aria-busy="true"]');
      const others = [...root.querySelectorAll("button")].filter(
        (b) =>
          b !== busy &&
          ["Reject all", "Accept all", "Reject", "Accept"].includes(shownText(b) ?? ""),
      );
      expect(busy?.getAttribute("aria-disabled")).toBeNull();
      expect(others).toHaveLength(5);
      for (const button of others) {
        expect(button.getAttribute("aria-disabled")).toBe("true");
        expect(button.disabled).toBe(false);
        expect(button.getAttribute("aria-describedby")).toContain(busy?.id ?? "no busy id");
      }

      await act(async () => answer(wrote("u1")));

      expect(root.querySelectorAll('[aria-disabled="true"]')).toHaveLength(0);
    });

    // C678 #1: the busy button said "Accept", so a faded Reject's reason read just "Accept".
    it.each([
      ["Accept", "Accepting…"],
      ["Reject", "Rejecting…"],
      ["Accept all", "Accepting all…"],
      ["Reject all", "Rejecting all…"],
    ])(
      "says %s is under way while it is sent, so the others' reason reads %s",
      async (label, busyLabel) => {
        let answer: (decided: ProposalDecided) => void = () => {};
        const pending = () => new Promise<ProposalDecided>((resolve) => (answer = resolve));
        const decisions = fakeDecisions({ accept: vi.fn(pending), reject: vi.fn(pending) });
        const { root } = open(decisions);

        await press(buttons(root, label)[0]);

        const busy = root.querySelector<HTMLButtonElement>('[aria-busy="true"]');
        expect(shownText(busy)).toBe(busyLabel);
        const other = root.querySelector('[aria-disabled="true"]');
        const reason = other?.getAttribute("aria-describedby")?.split(" ");
        expect(reason).toContain(busy?.id);
        expect(shownText(root.querySelector(`[id="${busy?.id}"]`))).toBe(busyLabel);

        await act(async () => answer(wrote("u1")));

        expect(root.querySelector('[aria-busy="true"]')).toBeNull();
      },
    );

    it("says a failed accept by its kind, not the host's words, and leaves the change undecided", async () => {
      const decisions = fakeDecisions({
        accept: vi.fn(async () => Promise.reject(new Error("The disk is full."))),
      });
      const { root } = open(decisions);

      await press(buttons(root, "Accept")[0]);

      expect(root.querySelector('[role="alert"]')?.textContent).toContain(
        "Couldn't accept this change. Halonic ran into a problem it can't explain yet.",
      );
      expect(root.textContent).not.toContain("The disk is full.");
      expect(buttons(root, "Copy details")).toHaveLength(1);
      expect(buttons(root, "Accept")).toHaveLength(2);
    });

    it("leaves a file changed after the run started undecided, says so, and keeps its Reject", async () => {
      const decisions = fakeDecisions({
        accept: vi.fn(async () => ({
          undo: null,
          changedSinceRun: ["notes/a.md"],
          cantBeWritten: [],
        })),
      });
      const { root, toasts } = open(decisions);

      await press(buttons(root, "Accept")[0]);

      const [changed] = root.querySelectorAll("li");
      expect(changed?.textContent).toContain(
        "This file changed after run 01JD8Q started, so it wasn't accepted. To keep it as it is now, reject it.",
      );
      expect(toasts.list()).toEqual([]);
      // Only a Reject can decide it now, so its Reject takes focus in place of an Accept.
      expect(changed?.querySelectorAll("button")).toHaveLength(1);
      expect(document.activeElement).toBe(buttons(root, "Reject")[0]);
      expect(buttons(root, "Accept all")).toHaveLength(1);

      await press(buttons(root, "Reject")[0]);

      expect(decisions.reject).toHaveBeenCalledWith("run_mfx3k2a1_0001JD8Q", {
        file: "notes/a.md",
      });
      expect(changed?.textContent).toContain("Rejected");
    });

    it("offers only Reject all once every open file changed after the run started", async () => {
      const decisions = fakeDecisions({
        accept: vi.fn(async () => ({
          undo: null,
          changedSinceRun: ["notes/a.md", "notes/b.md"],
          cantBeWritten: [],
        })),
      });
      const { root } = open(decisions);

      await press(buttons(root, "Accept all")[0]);

      expect(buttons(root, "Accept all")).toEqual([]);
      expect(buttons(root, "Reject all")).toHaveLength(1);
      expect(buttons(root, "Reject")).toHaveLength(2);
    });
  });

  describe("undoing", () => {
    it("offers only the newest decision's Undo, and says when a later decision kept it back", async () => {
      // The host takes nothing back once a later decision changed one of the step's files.
      const decisions = fakeDecisions({
        accept: vi.fn(async (_runId: string, target: { file: string } | "all") =>
          wrote(target === "all" ? "u-all" : `u-${target.file}`),
        ),
        undo: vi.fn(async () => ({
          leftAlone: ["notes/a.md", ".halonic/proposals/01JD8Q.json"],
          decidedAfter: true,
        })),
      });
      const { root, toasts } = open(decisions);
      await press(buttons(root, "Accept")[0]);
      const [first] = toasts.list();

      await press(buttons(root, "Accept")[0]);

      expect(toasts.list().map((toast) => toast.title)).toEqual([
        "Accepted 1 change from run 01JD8Q",
      ]);
      expect(toasts.list()[0]?.id).not.toBe(first?.id);

      await act(async () => first?.action?.onClick());

      expect(decisions.undo).toHaveBeenCalledWith("u-notes/a.md");
      expect(buttons(root, "Accept")).toHaveLength(0);
      const refused = toasts.list().find((toast) => toast.tone === "danger");
      expect(refused?.title).toBe(
        "Couldn't undo this: you decided more of run 01JD8Q's changes after it.",
      );
      expect(refused?.text).toBeUndefined();
    });

    it("keeps a file the host didn't put back accepted, and says so", async () => {
      const decisions = fakeDecisions({
        undo: vi.fn(async () => ({ leftAlone: ["notes/a.md"], decidedAfter: false })),
      });
      const { root, toasts } = open(decisions);
      await press(buttons(root, "Accept")[0]);

      await act(async () => toasts.list()[0]?.action?.onClick());

      expect(root.querySelector("li")?.textContent).toContain("Accepted");
      const refused = toasts.list().find((toast) => toast.tone === "danger");
      expect(refused?.title).toBe("Couldn't undo this.");
      expect(refused?.text).toBe("notes/a.md changed after it was accepted, so it stays accepted.");
    });

    it("puts back only the files the host restored, and says it undid part", async () => {
      const decisions = fakeDecisions({
        undo: vi.fn(async () => ({ leftAlone: ["notes/b.md"], decidedAfter: false })),
      });
      const { root, toasts } = open(decisions);
      await press(buttons(root, "Accept all")[0]);

      await act(async () => toasts.list()[0]?.action?.onClick());

      const lines = [...root.querySelectorAll("li")].map((li) => li.textContent ?? "");
      expect(lines[0]).toContain("Accept");
      expect(lines[0]).not.toContain("Accepted");
      expect(lines[1]).toContain("Accepted");
      const part = toasts.list().find((toast) => toast.tone === "warning");
      expect(part?.title).toBe("Undid part of the changes from run 01JD8Q");
      expect(part?.text).toBe("Couldn't put back notes/b.md: it changed after it was accepted.");
    });
  });

  it("settles a decision still on its way when the page is left, once its toast has gone", async () => {
    let answer: (decided: ProposalDecided) => void = () => {};
    const decisions = fakeDecisions({
      accept: vi.fn(() => new Promise<ProposalDecided>((resolve) => (answer = resolve))),
    });
    const { root, toasts } = open(decisions);
    await press(buttons(root, "Accept")[0]);

    unmountAll();
    await act(async () => answer(wrote("u1")));
    expect(decisions.settle).not.toHaveBeenCalled();

    const [toast] = toasts.list();
    expect(toast?.title).toBe("Accepted 1 change from run 01JD8Q");
    await act(async () => toast && toasts.close(toast.id));
    expect(decisions.settle).toHaveBeenCalledWith("run_mfx3k2a1_0001JD8Q");
  });

  it("settles the proposal only once the page is left and its last toast has gone", async () => {
    const decisions = fakeDecisions();
    const { root, toasts } = open(decisions);
    await press(buttons(root, "Accept all")[0]);

    unmountAll();
    expect(decisions.settle).not.toHaveBeenCalled();

    const [toast] = toasts.list();
    await act(async () => toast && toasts.close(toast.id));
    expect(decisions.settle).toHaveBeenCalledWith("run_mfx3k2a1_0001JD8Q");
  });
});
