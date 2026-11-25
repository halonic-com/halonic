import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type { TeamRun, TeamRuns, TeamRunsQuery, TeamStatus } from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

const run: TeamRun = {
  id: "paperclip:acme:run:r1",
  source: "paperclip:acme",
  agent: "paperclip:acme:agent:a1",
  state: "running",
  startedAt: "2026-11-25T09:00:00.000Z",
  canStop: true,
};

verifies("ports.team-runs", () => {
  typeTest("carries only the run's fields, never its log or error text", () => {
    expectTypeOf<keyof TeamRun>().toEqualTypeOf<
      | "id"
      | "source"
      | "agent"
      | "task"
      | "state"
      | "startedAt"
      | "finishedAt"
      | "lastActivityAt"
      | "paid"
      | "tokens"
      | "canStop"
    >();
    // @ts-expect-error a run has no log excerpt
    const withLog: TeamRun = { ...run, stdoutExcerpt: "…" };
    // @ts-expect-error a run has no error text
    const withError: TeamRun = { ...run, error: "…" };
    expectTypeOf(withLog).toEqualTypeOf<TeamRun>();
    expectTypeOf(withError).toEqualTypeOf<TeamRun>();
  });

  typeTest("is an optional read on TeamStatus", () => {
    expectTypeOf<TeamStatus["runs"]>().toEqualTypeOf<
      ((query: TeamRunsQuery) => Promise<readonly TeamRuns[]>) | undefined
    >();
    const withoutRuns: Omit<TeamStatus, "runs"> = {} as TeamStatus;
    expectTypeOf(withoutRuns).toMatchTypeOf<TeamStatus>();
  });
});
