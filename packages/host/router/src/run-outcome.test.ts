import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { beforeAll, expect, it } from "vitest";
import { loadCatalog, type ProviderCatalog } from "./catalog.ts";
import { type RunOutcome, routeOutcomeOf } from "./run-outcome.ts";

/** The catalog's real files, so the prices are the ones the export uses. */
async function repoCatalog(): Promise<ProviderCatalog> {
  const loaded = await loadCatalog({
    models: readFileSync(new URL("../providers.yaml", import.meta.url), "utf8"),
    router: readFileSync(new URL("../providers.router.yaml", import.meta.url), "utf8"),
  });
  if (!loaded.ok) {
    throw new Error(JSON.stringify(loaded.error));
  }
  return loaded.value;
}

/** The stamp the server writes for a run the router sent to DeepSeek. */
const deepseekStamp = {
  v: 1,
  variant: "V7",
  alias: "deepseek-flash",
  tool: "opencode",
  model: "deepseek/deepseek-v4.1-flash-1017",
  effort: null,
  addOns: [],
  step: "first",
};

/** A finished run record, shaped like `GET /api/heartbeat-runs/:id`, with extra fields the export drops. */
function runRecord(changes: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "run-1",
    issueId: "task-1",
    agentId: "agent-1",
    status: "succeeded",
    startedAt: "2026-11-25T10:00:00.000Z",
    processStartedAt: "2026-11-25T10:00:02.000Z",
    finishedAt: "2026-11-25T10:12:30.000Z",
    errorCode: null,
    usageJson: {
      billingType: "metered_api",
      costUsd: 0.12,
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 100_000,
      provider: "openrouter",
    },
    contextSnapshot: { wakeReason: "issue_assigned", halonicRouting: deepseekStamp },
    ...changes,
  };
}

function skipReason(outcome: RunOutcome): string {
  return outcome.kind === "skipped" ? outcome.reason : "row";
}

let catalog: ProviderCatalog;
beforeAll(async () => {
  catalog = await repoCatalog();
});

verifies("router.run-outcome", () => {
  it("prices a routed run at list price, with the paid cost and the price version", () => {
    const outcome = routeOutcomeOf(runRecord(), catalog);
    expect(outcome).toEqual({
      kind: "row",
      row: {
        decisionId: null,
        runId: "run-1",
        taskId: "task-1",
        stepIndex: null,
        step: "first",
        variantId: "V7",
        alias: "deepseek-flash",
        provider: "openrouter",
        pinnedHost: "deepinfra/fp8",
        tokensIn: 1_000_000,
        tokensOut: 100_000,
        cacheReadTokens: 0,
        cacheWriteTokens: null,
        costUsd: 0.1274,
        paidCostUsd: 0.12,
        reportedCostUsd: 0.12,
        priceVersion: catalog.priceVersion,
        costDrift: false,
        exitCause: "succeeded",
        trainingEvidence: true,
        agentMinutes: 12.5,
      },
    });
  });

  it("prices cached input at the cache price", () => {
    const usage = { costUsd: null, inputTokens: 0, cachedInputTokens: 1_000_000, outputTokens: 0 };
    const outcome = routeOutcomeOf(runRecord({ usageJson: usage }), catalog);
    expect(outcome.kind === "row" && outcome.row.costUsd).toBe(0.00294);
  });

  it("pays nothing for a seat run and flags a reported cost 25% over the list price", () => {
    const opusStamp = { ...deepseekStamp, variant: "V0", alias: "opus", tool: "claude-code" };
    const usage = {
      billingType: "subscription_included",
      costUsd: 0.5,
      inputTokens: 50_000,
      cachedInputTokens: 0,
      outputTokens: 10_000,
    };
    const outcome = routeOutcomeOf(
      runRecord({ usageJson: usage, contextSnapshot: { halonicRouting: opusStamp } }),
      catalog,
    );
    if (outcome.kind !== "row") {
      throw new Error(`skipped: ${outcome.reason}`);
    }
    expect([outcome.row.costUsd, outcome.row.paidCostUsd, outcome.row.costDrift]).toEqual([
      0.4,
      0,
      true,
    ]);
  });

  it("doesn't flag drift when no cost was reported", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 0 };
    const outcome = routeOutcomeOf(runRecord({ usageJson: usage }), catalog);
    expect(outcome.kind === "row" && [outcome.row.reportedCostUsd, outcome.row.costDrift]).toEqual([
      null,
      false,
    ]);
  });

  it("keeps the decision and step index once the stamp carries them", () => {
    const stamp = { ...deepseekStamp, decisionId: "dec-9", stepIndex: 1, step: "cascade" };
    const outcome = routeOutcomeOf(
      runRecord({ contextSnapshot: { halonicRouting: stamp } }),
      catalog,
    );
    expect(outcome.kind === "row" && [outcome.row.decisionId, outcome.row.stepIndex]).toEqual([
      "dec-9",
      1,
    ]);
  });

  it("skips a run that failed before its process started, whatever its wake carried", () => {
    const failedEarly = runRecord({
      status: "failed",
      errorCode: "config-invalid",
      processStartedAt: null,
    });
    expect(skipReason(routeOutcomeOf(failedEarly, catalog))).toBe("not-started");
  });

  it("skips a run the router gave no answer for", () => {
    const unrouted = { ...deepseekStamp, variant: null, alias: null, tool: null, step: null };
    const run = runRecord({ contextSnapshot: { halonicRouting: unrouted } });
    expect(skipReason(routeOutcomeOf(run, catalog))).toBe("unrouted");
  });

  it("skips a run without a stamp, or with one it can't read", () => {
    const noStamp = runRecord({ contextSnapshot: { wakeReason: "issue_assigned" } });
    const noSnapshot = runRecord({ contextSnapshot: null });
    const otherVersion = runRecord({
      contextSnapshot: { halonicRouting: { ...deepseekStamp, v: 2 } },
    });
    expect(
      [noStamp, noSnapshot, otherVersion].map((run) => skipReason(routeOutcomeOf(run, catalog))),
    ).toEqual(["unstamped", "unstamped", "unstamped"]);
  });

  it("skips a run that is still going, so a later pass reads it", () => {
    const running = runRecord({ status: "running", finishedAt: null });
    expect(skipReason(routeOutcomeOf(running, catalog))).toBe("unfinished");
  });

  it("skips a run stamped on an alias the catalog doesn't have", () => {
    const stamp = { ...deepseekStamp, alias: "mystery-model" };
    const run = runRecord({ contextSnapshot: { halonicRouting: stamp } });
    expect(skipReason(routeOutcomeOf(run, catalog))).toBe("unknown-alias");
  });

  it("skips a record without the fields it reads", () => {
    expect(skipReason(routeOutcomeOf({ id: "run-1" }, catalog))).toBe("unreadable");
  });

  it("keeps the cost of a provider_down run but not as training evidence", () => {
    const providerDown = runRecord({ status: "failed", errorCode: "provider_down" });
    const outcome = routeOutcomeOf(providerDown, catalog);
    if (outcome.kind !== "row") {
      throw new Error(`skipped: ${outcome.reason}`);
    }
    expect([outcome.row.exitCause, outcome.row.trainingEvidence, outcome.row.costUsd]).toEqual([
      "provider_down",
      false,
      0.1274,
    ]);
  });

  it("names the error code of any other failed run as its exit cause", () => {
    const timedOut = runRecord({ status: "failed", errorCode: "timeout" });
    const outcome = routeOutcomeOf(timedOut, catalog);
    expect(outcome.kind === "row" && [outcome.row.exitCause, outcome.row.trainingEvidence]).toEqual(
      ["timeout", true],
    );
  });
});
