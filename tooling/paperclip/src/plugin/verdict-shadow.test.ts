import { verifies } from "@halonicjs/testing-spec";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { expect, test, vi } from "vitest";
import { now, pull, snapshot } from "../merge-control/merge-control.test-helper.ts";
import { emptyShadowDay } from "../merge-control/shadow.ts";
import { manifest } from "./manifest.ts";
import { type VerdictShadowApi, verdictShadowReader, withVerdictChecks } from "./verdict-shadow.ts";

const companyId = "acme";
const repo = "halonic-com/halonic";
const created = new Date("2026-11-24T11:00:00Z");

function fakeApi(): VerdictShadowApi & { errors: string[] } {
  const harness = createTestHarness({ manifest, config: {} });
  const errors: string[] = [];
  return {
    errors,
    entities: harness.ctx.entities,
    agents: { list: vi.fn(async () => []) },
    issues: {
      get: vi.fn(async (identifier: string) =>
        identifier === "HAL-3" ? ({ id: "task-3" } as never) : null,
      ),
      listComments: vi.fn(async () => [
        {
          id: "c-1",
          authorAgentId: "agent-liam",
          origin: "comment",
          body: "Liam: approved",
          createdByRunId: "run-1",
          createdAt: created,
          updatedAt: created,
          deletedAt: new Date("2026-11-24T11:30:00Z"),
        } as never,
      ]),
    },
    logger: { error: (line: string) => errors.push(line) },
  };
}

const settings = { repo, teamLogin: "halonic-dev", reviewerIds: { liam: "agent-liam" } };

verifies("paperclip.verdicts-shadow", () => {
  test("reads a task's comments with their run, times and deletion", async () => {
    const reader = verdictShadowReader(fakeApi(), companyId, repo, settings.reviewerIds);
    expect(await reader.taskComments("HAL-3")).toEqual([
      {
        id: "c-1",
        authorAgentId: "agent-liam",
        origin: "comment",
        body: "Liam: approved",
        createdByRunId: "run-1",
        createdAt: created.toISOString(),
        updatedAt: created.toISOString(),
        deleted: true,
      },
    ]);
    expect(await reader.taskComments("HAL-9")).toEqual([]);
  });

  test("compares nothing until the board names the reviewers' agents", async () => {
    const day = emptyShadowDay(now);
    const facts = snapshot({ pulls: [pull(3)] });
    const unnamed = { ...settings, reviewerIds: {} };
    expect(await withVerdictChecks(fakeApi(), companyId, day, facts, unnamed, now)).toBe(day);
    const checked = await withVerdictChecks(fakeApi(), companyId, day, facts, settings, now);
    expect(checked.verdicts?.["3"]).toMatchObject({ gate: true, recorded: "not approved" });
  });

  test("records that can't be read leave the pull request unknown, and the pass goes on", async () => {
    const api = fakeApi();
    const broken = {
      ...api,
      entities: {
        ...api.entities,
        list: vi.fn(async () => {
          throw new Error("down");
        }),
      },
    };
    const day = emptyShadowDay(now);
    const facts = snapshot({ pulls: [pull(3)] });
    const checked = await withVerdictChecks(broken, companyId, day, facts, settings, now);
    expect(checked.verdicts?.["3"]?.recorded).toBe("unknown");
    expect(api.errors).toEqual([]);
  });
});
