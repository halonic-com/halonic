// @vitest-environment jsdom
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ProposalDecided,
  type ProposalDecisions,
  ProposalGoneError,
} from "../proposal-decisions.ts";
import type { ProposalItem } from "../proposal-items.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ProposalCard } from "./proposal-card.tsx";

afterEach(() => {
  unmountAll();
});

const finishedAt = new Date(2026, 10, 12, 6, 12);

function proposal(fields: Partial<ProposalItem> = {}): ProposalItem {
  return {
    kind: "proposal",
    key: "proposal:run_mfx3k2a1_0001JD8Q",
    runId: "run_mfx3k2a1_0001JD8Q",
    changes: 2,
    items: ["support-triage"],
    itemNames: ["Support triage"],
    files: [
      { path: "notes/a.md", change: "modified", decision: "undecided" },
      { path: "notes/b.md", change: "added", decision: "undecided" },
    ],
    ending: "finished",
    since: finishedAt.toISOString(),
    ...fields,
  };
}

const wrote = (undo: string): ProposalDecided => ({ undo, changedSinceRun: [], cantBeWritten: [] });

function fakeDecisions(overrides: Partial<ProposalDecisions> = {}) {
  return {
    accept: vi.fn(async () => wrote("u1")),
    reject: vi.fn(async () => wrote("u2")),
    undo: vi.fn(async () => ({ leftAlone: [] as readonly string[] })),
    settle: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    ...overrides,
  } satisfies ProposalDecisions;
}

function open(decisions: ProposalDecisions | undefined, item = proposal()) {
  const toasts = createToastStore();
  const onDecided = vi.fn();
  const root = render(
    <ToastStoreProvider store={toasts}>
      <ProposalCard
        item={item}
        now={new Date(2026, 10, 12, 9, 0)}
        facts={{ hubId: "support", workflow: "Support triage", startedBy: "a schedule" }}
        decisions={decisions}
        onDecided={onDecided}
        onOpenRun={() => {}}
      />
    </ToastStoreProvider>,
  );
  return { root, toasts, onDecided };
}

function buttons(root: HTMLElement, name: string): HTMLButtonElement[] {
  return [...root.querySelectorAll("button")].filter((b) => b.textContent?.trim() === name);
}

async function press(button: HTMLButtonElement | undefined) {
  await act(async () => button?.click());
}

verifies("inbox.proposal-page", () => {
  describe("in a window that can't decide", () => {
    it("has no Accept or Reject, and ends with the command that shows the proposal", () => {
      const { root } = open(undefined);
      expect(buttons(root, "Accept all")).toEqual([]);
      expect(buttons(root, "Accept")).toEqual([]);
      expect(buttons(root, "Reject")).toEqual([]);
      expect(root.textContent).toContain(
        "Studio can't accept or reject these changes here. To see them and decide, run this in a terminal:",
      );
      expect(root.querySelector("code")?.textContent).toBe("halonic proposals show 01JD8Q");
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
      expect(primary.map((b) => b.textContent?.trim())).toEqual(["Accept all"]);
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
          ["Reject all", "Accept all", "Reject", "Accept"].includes(b.textContent?.trim() ?? ""),
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

    it("says a failed accept with its reason and Try again, and leaves the change undecided", async () => {
      const decisions = fakeDecisions({
        accept: vi.fn(async () => Promise.reject(new Error("The disk is full."))),
      });
      const { root } = open(decisions);

      await press(buttons(root, "Accept")[0]);

      expect(root.querySelector('[role="alert"]')?.textContent).toContain(
        "Couldn't accept this change. The disk is full.",
      );
      expect(buttons(root, "Try again")).toHaveLength(1);
      expect(buttons(root, "Accept")).toHaveLength(2);
    });

    it("leaves a file the person changed after the run started undecided, and says so", async () => {
      const decisions = fakeDecisions({
        accept: vi.fn(async () => ({
          undo: null,
          changedSinceRun: ["notes/a.md"],
          cantBeWritten: [],
        })),
      });
      const { root, toasts } = open(decisions);

      await press(buttons(root, "Accept")[0]);

      expect(root.textContent).toContain(
        "You changed this file after run 01JD8Q started, so it wasn't accepted.",
      );
      expect(toasts.list()).toEqual([]);
    });
  });

  describe("undoing", () => {
    it("offers only the newest decision's Undo, and keeps a file the host didn't put back", async () => {
      // The host takes nothing back once a later decision changed the run's record.
      const decisions = fakeDecisions({
        accept: vi.fn(async (_runId: string, target: { file: string } | "all") =>
          wrote(target === "all" ? "u-all" : `u-${target.file}`),
        ),
        undo: vi.fn(async () => ({
          leftAlone: ["notes/a.md", ".halonic/proposals/01JD8Q.json"],
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
      expect(refused?.title).toBe("Couldn't undo this.");
      expect(refused?.text).toBe("notes/a.md changed after it was accepted, so it stays accepted.");
    });

    it("puts back only the files the host restored", async () => {
      const decisions = fakeDecisions({
        undo: vi.fn(async () => ({ leftAlone: ["notes/b.md"] })),
      });
      const { root, toasts } = open(decisions);
      await press(buttons(root, "Accept all")[0]);

      await act(async () => toasts.list()[0]?.action?.onClick());

      const lines = [...root.querySelectorAll("li")].map((li) => li.textContent ?? "");
      expect(lines[0]).toContain("Accept");
      expect(lines[0]).not.toContain("Accepted");
      expect(lines[1]).toContain("Accepted");
      expect(toasts.list().find((toast) => toast.tone === "danger")?.text).toBe(
        "notes/b.md changed after it was accepted, so it stays accepted.",
      );
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

const gone = () => Promise.reject(new ProposalGoneError("The run's branch was deleted."));

verifies("inbox.proposal-page-states", () => {
  describe("a proposal whose texts are gone", () => {
    it("offers only Remove once the host says so, and focuses its line", async () => {
      const { root } = open(fakeDecisions({ accept: vi.fn(gone) }));
      await press(buttons(root, "Accept")[0]);

      const line = [...root.querySelectorAll("p")].find(
        (p) => p.textContent === "This proposal can't be opened any more.",
      );
      expect(line).toBeDefined();
      expect(document.activeElement).toBe(line);
      expect(buttons(root, "Remove")).toHaveLength(1);
      for (const name of ["Accept", "Reject", "Accept all", "Reject all"]) {
        expect(buttons(root, name)).toEqual([]);
      }
      expect(root.querySelector('[role="alert"]')).toBeNull();
    });

    it("removes it with no dialog, and has the Inbox read its items again", async () => {
      const decisions = fakeDecisions({ reject: vi.fn(gone) });
      const { root, onDecided } = open(decisions);
      await press(buttons(root, "Reject all")[0]);
      await press(buttons(root, "Remove")[0]);

      expect(decisions.remove).toHaveBeenCalledWith("run_mfx3k2a1_0001JD8Q");
      expect(onDecided).toHaveBeenCalledTimes(1);
      expect(root.querySelector('[role="dialog"]')).toBeNull();
    });

    it("says a failed Remove with its reason, and keeps Remove to try again", async () => {
      const remove = vi
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(new Error("The agent host isn't answering."))
        .mockResolvedValueOnce(undefined);
      const { root, onDecided } = open(fakeDecisions({ accept: vi.fn(gone), remove }));
      await press(buttons(root, "Accept")[0]);
      await press(buttons(root, "Remove")[0]);

      expect(root.querySelector('[role="alert"]')?.textContent).toBe(
        "Couldn't remove this proposal. The agent host isn't answering.",
      );
      expect(onDecided).not.toHaveBeenCalled();
      await press(buttons(root, "Remove")[0]);
      expect(onDecided).toHaveBeenCalledTimes(1);
      expect(root.querySelector('[role="alert"]')).toBeNull();
    });
  });

  it("shows the decisions the Inbox read again, such as one from another window", async () => {
    let refresh: (item: ProposalItem) => void = () => {};
    function Refreshing() {
      const [item, setItem] = useState(proposal());
      refresh = setItem;
      return (
        <ProposalCard
          item={item}
          now={new Date(2026, 10, 12, 9, 0)}
          facts={undefined}
          decisions={fakeDecisions()}
          onDecided={() => {}}
        />
      );
    }
    const root = render(
      <ToastStoreProvider store={createToastStore()}>
        <Refreshing />
      </ToastStoreProvider>,
    );
    expect(buttons(root, "Accept")).toHaveLength(2);

    const decidedElsewhere = proposal({
      files: [
        { path: "notes/a.md", change: "modified", decision: "accepted" },
        { path: "notes/b.md", change: "added", decision: "undecided" },
      ],
    });
    await act(async () => refresh(decidedElsewhere));
    expect(buttons(root, "Accept")).toHaveLength(1);
    expect(root.textContent).toContain("Accepted");
  });
});
