import type { Routine } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { PlacedRoutine } from "./due.ts";
import { routineStart } from "./routine-start.ts";

function placed(run: object, hub: string | null = "h"): PlacedRoutine {
  const routine = {
    version: 1,
    id: "r1",
    name: "r1",
    enabled: true,
    trigger: { manual: true },
    overlap: "skip",
    catchUp: "last",
    run,
  } as unknown as Routine;
  return { hub, routine };
}
const at = new Date("2026-01-02T08:00:00Z");
const lastRun = new Date("2026-01-01T08:00:00Z");

verifies("routines.routine-start", () => {
  it("fills the trigger placeholders in a workflow's input", () => {
    const routine = placed({
      workflow: "digest",
      input: { since: "{{trigger.lastRun}}", note: "at {{trigger.at}}", n: 3 },
    });
    expect(routineStart(routine, { at, lastRun })).toEqual({
      workflow: "digest",
      hub: "h",
      input: { since: "2026-01-01T08:00:00.000Z", note: "at 2026-01-02T08:00:00.000Z", n: 3 },
    });
  });

  it("gives null for a whole-placeholder input when the routine never ran", () => {
    const routine = placed({ workflow: "digest", input: { since: "{{trigger.lastRun}}" } });
    expect(routineStart(routine, { at, lastRun: null })).toMatchObject({
      input: { since: null },
    });
  });

  it("fills the prompt of an agent with the mail message", () => {
    const routine = placed({ agent: "a", prompt: "Mail: {{trigger.message.subject}}" });
    expect(routineStart(routine, { at, lastRun: null, message: { subject: "Hi" } })).toEqual({
      agent: "a",
      hub: "h",
      prompt: "Mail: Hi",
    });
  });

  it("prefers the target's own hub, and falls back to none for a workspace routine", () => {
    const own = placed({ hub: "other", agent: "a", prompt: "p" });
    expect(routineStart(own, { at, lastRun })).toMatchObject({ hub: "other" });
    const workspace = placed({ agent: "a", prompt: "p" }, null);
    expect(routineStart(workspace, { at, lastRun })).toMatchObject({ hub: null });
  });
});
