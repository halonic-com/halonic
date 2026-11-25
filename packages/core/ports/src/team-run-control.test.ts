import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expectTypeOf } from "vitest";
import type {
  MessagingId,
  RunAgainCheck,
  RunAgainResult,
  StopRunResult,
  TeamRun,
  TeamRunControl,
  TeamStatus,
} from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

const run: TeamRun = {
  id: "paperclip:acme:run:r1",
  source: "paperclip:acme",
  agent: "paperclip:acme:agent:a1",
  state: "running",
  canStop: true,
};

verifies("ports.team-run-control", () => {
  typeTest("refuses with a reason from a closed set, never a source's text", () => {
    // @ts-expect-error a stop refusal's reason is a code, not text
    const stopText: StopRunResult = { outcome: "refused", reason: "Run is already finished" };
    // @ts-expect-error a Run again refusal's reason is a code, not text
    const againText: RunAgainResult = { outcome: "refused", reason: "Issue is closed" };
    // @ts-expect-error a check's reason is a code, not text
    const checkText: RunAgainCheck = { offered: false, why: "Assigned to someone else" };
    expectTypeOf(stopText).toEqualTypeOf<StopRunResult>();
    expectTypeOf(againText).toEqualTypeOf<RunAgainResult>();
    expectTypeOf(checkText).toEqualTypeOf<RunAgainCheck>();
  });

  typeTest("takes the run's ID, never the run", () => {
    expectTypeOf<Parameters<TeamRunControl["stop"]>>().toEqualTypeOf<[run: MessagingId]>();
    expectTypeOf<Parameters<TeamRunControl["runAgainCheck"]>>().toEqualTypeOf<[run: MessagingId]>();
    expectTypeOf<Parameters<TeamRunControl["runAgain"]>>().toEqualTypeOf<[run: MessagingId]>();
    // Never called: only its typecheck matters.
    const stopWholeRun = (control: TeamRunControl) =>
      // @ts-expect-error a whole run, with its possibly stale `canStop`, isn't accepted
      control.stop(run);
    expectTypeOf(stopWholeRun).returns.toEqualTypeOf<Promise<StopRunResult>>();
  });

  typeTest("names who holds a moved task by display name only", () => {
    type NotOffered = Extract<RunAgainCheck, { offered: false }>;
    expectTypeOf<keyof NotOffered>().toEqualTypeOf<"offered" | "why" | "task" | "holder">();
    expectTypeOf<NotOffered["holder"]>().toEqualTypeOf<string | undefined>();
  });

  typeTest("leaves TeamStatus without a write member", () => {
    expectTypeOf<Extract<keyof TeamStatus, keyof TeamRunControl>>().toEqualTypeOf<never>();
  });
});
