// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ProposalCompare,
  type ProposalDecided,
  type ProposalDecisions,
  ProposalFailedError,
} from "../proposal-decisions.ts";
import { unmountAll } from "../test-support/render.tsx";
import { buttons, press, proposal, renderCard, wrote } from "./proposal-card.test-helper.tsx";

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
    compare: vi.fn(async () => texts),
    choose: vi.fn(async () => wrote("u3")),
    ...overrides,
  } satisfies ProposalDecisions;
}

function open(decisions: ProposalDecisions) {
  return renderCard(decisions, proposal(), vi.fn());
}

const seen = `sha256:${"a".repeat(64)}`;
const texts: ProposalCompare = { saved: "mine\n", run: "the run's\n", canCombine: false, seen };
const leftAlone = (...paths: string[]): ProposalDecided => ({
  undo: null,
  changedSinceRun: paths,
  cantBeWritten: [],
});

/** The page after **Accept** on `notes/a.md`, which the person changed since the run started. */
async function openCompare(overrides: Parameters<typeof fakeDecisions>[0] = {}) {
  const decisions = fakeDecisions({
    accept: vi.fn(async () => leftAlone("notes/a.md")),
    ...overrides,
  });
  const page = open(decisions);
  await press(buttons(page.root, "Accept")[0]);
  return { ...page, decisions };
}

function compareView(root: HTMLElement): HTMLElement | null {
  return root.querySelector('section[aria-label="Compare notes/a.md"]');
}

verifies("inbox.proposal-compare", () => {
  describe("opening", () => {
    it("opens Compare under a file Accept left alone, with both texts, and focuses it", async () => {
      const { root, decisions } = await openCompare();

      const view = compareView(root);
      expect(view?.textContent).toContain("Yours");
      expect(view?.textContent).toContain("mine");
      expect(view?.textContent).toContain("Run 01JD8Q's");
      expect(view?.textContent).toContain("the run's");
      expect(document.activeElement).toBe(view);
      expect(decisions.compare).toHaveBeenCalledWith("run_mfx3k2a1_0001JD8Q", "notes/a.md");
      expect(buttons(root, "Combine both")).toEqual([]);
    });

    it("keeps Accept on the file, which opens Compare again without asking the host", async () => {
      const { root, decisions } = await openCompare();
      await press(buttons(root, "Cancel")[0]);
      expect(compareView(root)).toBeNull();
      expect(root.textContent).toContain(
        "This file changed after run 01JD8Q started. Accept opens Compare.",
      );

      await press(buttons(root, "Accept")[0]);

      expect(compareView(root)).not.toBeNull();
      expect(decisions.accept).toHaveBeenCalledTimes(1);
    });

    it("says No file for a text that doesn't exist", async () => {
      const { root } = await openCompare({
        compare: vi.fn(async () => ({ ...texts, run: null })),
      });
      const none = compareView(root)?.querySelector("p.text-fg-muted");
      expect(none?.textContent).toBe("No file");
    });

    it("accepts the rest with Accept all, then opens Compare on the changed file", async () => {
      const decisions = fakeDecisions({
        accept: vi.fn(async () => ({ ...wrote("u1"), changedSinceRun: ["notes/a.md"] })),
      });
      const { root } = open(decisions);

      await press(buttons(root, "Accept all")[0]);

      expect(root.textContent).toContain("Accepted");
      expect(compareView(root)).not.toBeNull();
    });
  });

  describe("choosing", () => {
    it("counts Keep mine as Rejected, with its toast, and closes Compare", async () => {
      const { root, toasts, decisions } = await openCompare();

      await press(buttons(root, "Keep mine")[0]);

      expect(decisions.reject).toHaveBeenCalledWith("run_mfx3k2a1_0001JD8Q", {
        file: "notes/a.md",
      });
      expect(toasts.list().map((toast) => toast.title)).toEqual([
        "Rejected 1 change from run 01JD8Q",
      ]);
      expect(compareView(root)).toBeNull();
    });

    it("sends Combine both with what Compare showed, and counts it as Accepted", async () => {
      const { root, toasts, decisions } = await openCompare({
        compare: vi.fn(async () => ({ ...texts, canCombine: true })),
      });

      await press(buttons(root, "Combine both")[0]);

      expect(decisions.choose).toHaveBeenCalledWith(
        "run_mfx3k2a1_0001JD8Q",
        "notes/a.md",
        "combine-both",
        seen,
      );
      expect(toasts.list().map((toast) => toast.title)).toEqual([
        "Accepted 1 change from run 01JD8Q",
      ]);
      expect(compareView(root)).toBeNull();
    });

    it("writes nothing over a file saved again after Compare opened, and shows it as it is now", async () => {
      const compare = vi
        .fn<() => Promise<ProposalCompare>>()
        .mockResolvedValueOnce(texts)
        .mockResolvedValue({ ...texts, saved: "mine, saved again\n" });
      const { root } = await openCompare({
        compare,
        choose: vi.fn(async () => leftAlone("notes/a.md")),
      });

      await press(buttons(root, "Use the run's")[0]);

      const view = compareView(root);
      expect(view?.textContent).toContain(
        "This file changed after Compare opened, so nothing was written. Here it is now.",
      );
      expect(view?.textContent).toContain("mine, saved again");
      expect(compare).toHaveBeenCalledTimes(2);
    });

    it("says why a choice failed, keeps Compare open, and sends it again on Try again", async () => {
      const choose = vi
        .fn<ProposalDecisions["choose"]>()
        .mockRejectedValueOnce(new ProposalFailedError("not-answering", "connect ECONNREFUSED"))
        .mockResolvedValue(wrote("u3"));
      const { root, toasts } = await openCompare({ choose });

      await press(buttons(root, "Use the run's")[0]);

      expect(compareView(root)?.textContent).toContain(
        "Couldn't apply your choice. The engine isn't answering. It may still be starting.",
      );
      expect(buttons(root, "Keep mine")).toHaveLength(1);
      // The failure sits right above the button that was pressed, not above the texts.
      const alert = compareView(root)?.querySelector('[role="alert"]');
      expect(alert?.nextElementSibling?.contains(buttons(root, "Keep mine")[0] ?? null)).toBe(true);

      await press(buttons(root, "Try again")[0]);

      expect(choose).toHaveBeenNthCalledWith(
        2,
        "run_mfx3k2a1_0001JD8Q",
        "notes/a.md",
        "use-run",
        seen,
      );
      expect(toasts.list().map((toast) => toast.title)).toEqual([
        "Accepted 1 change from run 01JD8Q",
      ]);
      expect(compareView(root)).toBeNull();
    });
  });

  it("says why the texts couldn't be read, with Try again and Close", async () => {
    const compare = vi
      .fn<() => Promise<ProposalCompare>>()
      .mockRejectedValueOnce(new Error("The agent host isn't answering."))
      .mockResolvedValue(texts);
    const { root } = await openCompare({ compare });
    expect(compareView(root)?.textContent).toContain(
      "Couldn't open Compare. The agent host isn't answering.",
    );

    await act(async () => buttons(root, "Try again")[0]?.click());

    expect(compareView(root)?.textContent).toContain("mine");
  });

  it("closes Compare on a load failure's Close, leaving the file undecided", async () => {
    const { root, decisions } = await openCompare({
      compare: vi.fn(async () => {
        throw new Error("The agent host isn't answering.");
      }),
    });

    await press(buttons(root, "Close")[0]);

    expect(compareView(root)).toBeNull();
    expect(decisions.reject).not.toHaveBeenCalled();
    expect(buttons(root, "Accept")).toHaveLength(2);
  });
});
