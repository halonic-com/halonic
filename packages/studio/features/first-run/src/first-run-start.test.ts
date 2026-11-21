import { readFileSync } from "node:fs";
import type { ChoiceChange } from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import type { RunStartHost } from "@halonicjs/studio-feature-runs/api";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { FirstRun } from "./first-run.ts";
import { firstRunGuide } from "./first-run-guide.ts";
import { changedLine, FirstRunStart, refundQuestion } from "./first-run-start.ts";
import type { FirstRunState } from "./first-run-state.ts";

const folder = "/docs/Acme sample";
const supportReply = { hubId: "support", id: "support-reply" };
const runId = "run_mfx3k2a1_01jd8q";

/** A first run whose runs list holds `runs`, and lets a test change them. */
function firstRunOf(saved: FirstRunState | undefined, runs: RunSummary[] = []) {
  let text = saved === undefined ? undefined : JSON.stringify(saved);
  const listeners = new Set<() => void>();
  const list = {
    state: {
      runs: runs.map((summary) => ({ summary })),
      loaded: true,
      error: undefined,
      workflows: undefined,
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    source: { log: async () => [] },
  };
  const device = { folder, read: () => text, write: (next: string) => (text = next) };
  const firstRun = new FirstRun(list, { isSample: () => true }, device, () => new Date(0));
  firstRun.notice();
  const setRuns = (next: RunSummary[]) => {
    list.state = { ...list.state, runs: next.map((summary) => ({ summary })) };
    for (const listener of listeners) listener();
  };
  return { firstRun, setRuns };
}

function run(status: RunSummary["status"], changes: Partial<RunSummary> = {}): RunSummary {
  return {
    id: runId,
    hubId: "support",
    workflowId: "support-reply",
    kind: "run",
    status,
    state: "sort",
    startedAt: "1970-01-01T00:00:01.000Z",
    endedAt: null,
    ...changes,
  } as RunSummary;
}

function host(changes: Partial<RunStartHost> = {}): RunStartHost {
  return {
    startRun: vi.fn(async () => ({ runId })),
    cancelRun: vi.fn(async () => {}),
    ...changes,
  };
}

const anthropic: ChoiceChange = {
  kind: "alias-repointed",
  file: "models.yaml",
  alias: "default",
  provider: "anthropic",
  providerName: "Anthropic",
  model: "claude-haiku-4-5",
  local: false,
};

const guideOf = (firstRun: FirstRun, start: FirstRunStart) =>
  firstRunGuide(firstRun, start, { view: "PickModelPage", load: async () => ({}) });

/** Lets the first run follow the runs list, which it does in a few promise turns, no timer. */
async function settled() {
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
}

verifies("first-run.run", () => {
  it("starts Support reply with Sam's email, Acme's examples/refund-question.json", async () => {
    const file = new URL(
      "../../../../../examples/acme/examples/refund-question.json",
      import.meta.url,
    );
    expect(refundQuestion).toEqual(JSON.parse(readFileSync(file, "utf8")));
    const { firstRun } = firstRunOf(undefined);
    const runStart = host();
    const showRun = vi.fn();
    firstRun.pickModel();
    await new FirstRunStart(firstRun, runStart).continueWith({ kind: "sample" }, showRun);
    expect(runStart.startRun).toHaveBeenCalledWith(
      { hubId: "support", workflowId: "support-reply" },
      refundQuestion,
    );
    expect(showRun).toHaveBeenCalledWith(runId);
    expect(firstRun.isPicking).toBe(false);
  });

  describe("Pick a model", () => {
    it("opens from the guide card's button, in place of Support reply's page, at Model", () => {
      const { firstRun } = firstRunOf(undefined);
      const guide = guideOf(firstRun, new FirstRunStart(firstRun, host()));
      guide.card(supportReply)?.action.run({ openRunForm: vi.fn() });
      expect(guide.screen?.(supportReply)?.title).toBe("Pick a model");
      expect(guide.screen?.({ hubId: "support", id: "triage" })).toBeUndefined();
      expect(firstRun.state).toMatchObject({ kind: "on", step: "model" });
    });

    it("isn't moved by the runs while it is open, and Back puts the steps where the runs say", async () => {
      const { firstRun, setRuns } = firstRunOf(undefined);
      firstRun.pickModel();
      setRuns([run("failed", { reason: "error" })]);
      await settled();
      expect(firstRun.state).toMatchObject({ step: "model" });
      firstRun.closePicker("back");
      await settled();
      expect(firstRun.state).toMatchObject({ step: "run", failed: true });
    });

    it("stays open with why when the run doesn't start", async () => {
      const { firstRun } = firstRunOf(undefined);
      firstRun.pickModel();
      const refused = new Error("The engine isn't answering.");
      const start = new FirstRunStart(
        firstRun,
        host({ startRun: async () => Promise.reject(refused) }),
      );
      await expect(start.continueWith({ kind: "sample" }, vi.fn())).rejects.toBe(refused);
      expect(firstRun.isPicking).toBe(true);
    });
  });

  describe("the run's page", () => {
    it("shows the change line once, and the caption on the first run only", async () => {
      const { firstRun } = firstRunOf(undefined);
      const runStart = host();
      const start = new FirstRunStart(firstRun, runStart);
      const guide = guideOf(firstRun, start);
      const saved = { kind: "saved" as const, changes: [anthropic], trusted: true };
      await start.continueWith(saved, vi.fn());
      expect(guide.run?.(supportReply, runId)).toMatchObject({
        notes: ["Changed 1 line in models.yaml: Agents now use Anthropic."],
        caption:
          "Each box is an agent or a rule. You can change all of it later: it's plain files.",
      });
      vi.mocked(runStart.startRun).mockResolvedValueOnce({ runId: "run_mfx3k2a1_02kd9r" });
      await start.continueWith({ kind: "sample" }, vi.fn());
      expect(guide.run?.(supportReply, "run_mfx3k2a1_02kd9r")?.caption).toBeUndefined();
      expect(guide.run?.(supportReply, runId)?.notes).toEqual([]);
    });

    it("offers Pick another model, which opens the screen again", async () => {
      const { firstRun } = firstRunOf(undefined);
      const start = new FirstRunStart(firstRun, host());
      await start.continueWith({ kind: "sample" }, vi.fn());
      guideOf(firstRun, start).run?.(supportReply, runId)?.pickAnotherModel?.();
      expect(firstRun.isPicking).toBe(true);
    });

    it("words the change for a local model, Local only turned off, and an added provider", () => {
      expect(changedLine([{ ...anthropic, local: true, model: "llama3.2:latest" }])).toBe(
        "Changed 1 line in models.yaml: Agents now use llama3.2:latest on this computer.",
      );
      expect(
        changedLine([
          { kind: "provider-added", file: "providers/anthropic.yaml", provider: "anthropic" },
          anthropic,
          { kind: "local-only-off", file: "workspace.yaml" },
        ]),
      ).toBe(
        "Changed 2 lines: Agents now use Anthropic (models.yaml), and Local only is off for this workspace (workspace.yaml). Added providers/anthropic.yaml.",
      );
      expect(changedLine([])).toBeUndefined();
    });
  });

  describe("Cancel run", () => {
    it("cancels the going run, takes it off the page, and the card reads Run again with the change", async () => {
      const { firstRun, setRuns } = firstRunOf(undefined);
      const runStart = host();
      const start = new FirstRunStart(firstRun, runStart);
      const guide = guideOf(firstRun, start);
      await start.continueWith({ kind: "saved", changes: [anthropic], trusted: true }, vi.fn());
      setRuns([run("running")]);
      await settled();
      expect(firstRun.runningId).toBe(runId);

      await start.cancel();
      expect(runStart.cancelRun).toHaveBeenCalledWith(runId);
      expect(guide.run?.(supportReply, runId)?.dismissed).toBe(true);

      setRuns([run("failed", { reason: "cancelled" })]);
      await settled();
      expect(firstRun.state).toMatchObject({ step: "run", ended: true });
      const card = guide.card(supportReply);
      expect(card?.action.label).toBe("Run again");
      expect(card?.lines.at(-1)?.text).toBe(
        "Changed 1 line in models.yaml: Agents now use Anthropic.",
      );
    });

    it("passes on the engine's reason, and keeps the run on the page", async () => {
      const { firstRun, setRuns } = firstRunOf(undefined);
      const refused = new Error("There's no run.");
      const start = new FirstRunStart(
        firstRun,
        host({ cancelRun: async () => Promise.reject(refused) }),
      );
      await start.continueWith({ kind: "sample" }, vi.fn());
      setRuns([run("running")]);
      await settled();
      await expect(start.cancel()).rejects.toBe(refused);
      expect(start.additions(runId)?.dismissed).toBe(false);
    });

    it("isn't offered where the engine can't cancel", () => {
      const { firstRun } = firstRunOf(undefined);
      expect(new FirstRunStart(firstRun, { startRun: vi.fn() }).canCancel).toBe(false);
    });
  });
});
