import type { Routine } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { PlacedRoutine } from "./due.ts";
import { routineStart } from "./routine-start.ts";

function placed(
  run: object,
  hub: string | null = "h",
  trigger: object = { manual: true },
): PlacedRoutine {
  const routine = {
    version: 1,
    id: "r1",
    name: "r1",
    enabled: true,
    trigger,
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
    const mail = { mail: { connector: "gmail", query: "in:inbox", every: "2m" } };
    const routine = placed({ agent: "a", prompt: "Mail: {{trigger.message.subject}}" }, "h", mail);
    expect(routineStart(routine, { at, lastRun: null, message: { subject: "Hi" } })).toEqual({
      agent: "a",
      hub: "h",
      prompt: "Mail: Hi",
    });
  });

  it("fills the prompt of an agent with the signal's data", () => {
    const onPaid = { signal: { name: "invoice.paid" } };
    const routine = placed(
      { agent: "a", prompt: "Tell the team {{trigger.signal.vendor}} was paid." },
      "h",
      onPaid,
    );
    const signal = { vendor: "Acme" };
    expect(routineStart(routine, { at, lastRun: null, signal })).toMatchObject({
      prompt: "Tell the team Acme was paid.",
    });
  });

  it("prefers the target's own hub, and falls back to none for a workspace routine", () => {
    const own = placed({ hub: "other", agent: "a", prompt: "p" });
    expect(routineStart(own, { at, lastRun })).toMatchObject({ hub: "other" });
    const workspace = placed({ agent: "a", prompt: "p" }, null);
    expect(routineStart(workspace, { at, lastRun })).toMatchObject({ hub: null });
  });
});

verifies("routines.trigger-values", () => {
  it("starts nothing when an input names a value the trigger doesn't have, instead of dropping the key", () => {
    const routine = placed({ workflow: "digest", input: { day: "{{trigger.date}}" } });
    expect(() => routineStart(routine, { at, lastRun })).toThrow(
      "{{trigger.date}} isn't a trigger value. Use {{trigger.at}} or {{trigger.lastRun}}.",
    );
  });

  it("starts nothing when a prompt would read an empty value", () => {
    const routine = placed({ agent: "a", prompt: "Today is {{trigger.today}}." });
    expect(() => routineStart(routine, { at, lastRun })).toThrow("{{trigger.today}}");
  });
});
