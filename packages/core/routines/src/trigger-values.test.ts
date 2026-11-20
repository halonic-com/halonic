import type { Routine } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { triggerValueProblems } from "./trigger-values.ts";

function routine(trigger: object, run: object): Routine {
  return { id: "r1", name: "r1", enabled: true, trigger, run } as unknown as Routine;
}
const schedule = { schedule: "0 16 * * 5" };
const webhook = { webhook: { secret: "HOOK", headers: ["x-event"] } };

verifies("routines.trigger-values", () => {
  it("accepts every value each trigger has", () => {
    const input = { at: "{{trigger.at}}", since: "on {{ trigger.lastRun }}", n: 3 };
    expect(triggerValueProblems(routine(schedule, { workflow: "w", input }))).toEqual([]);
    const hook = { body: "{{trigger.body.id}}", event: "{{trigger.headers.x-event}}" };
    expect(triggerValueProblems(routine(webhook, { workflow: "w", input: hook }))).toEqual([]);
    const mail = { mail: { connector: "gmail" } };
    const prompt = "Mail: {{trigger.message.subject}}";
    expect(triggerValueProblems(routine(mail, { agent: "a", prompt }))).toEqual([]);
    const signal = { signal: { name: "invoice.paid" } };
    const paid = "Tell the team {{trigger.signal.vendor}} was paid.";
    expect(triggerValueProblems(routine(signal, { agent: "a", prompt: paid }))).toEqual([]);
  });

  it("names a value no trigger has, with the ones this trigger has", () => {
    const input = { day: "{{trigger.date}}" };
    expect(triggerValueProblems(routine(schedule, { workflow: "w", input }))).toEqual([
      {
        path: ["run", "input", "day"],
        message:
          "{{trigger.date}} isn't a trigger value. Use {{trigger.at}} or {{trigger.lastRun}}.",
      },
    ]);
  });

  it("names a placeholder outside the trigger, in a prompt", () => {
    const prompt = "Write for {{input.day}}.";
    expect(triggerValueProblems(routine(schedule, { agent: "a", prompt }))).toEqual([
      {
        path: ["run", "prompt"],
        message: "{{input.day}} isn't a trigger value. Use {{trigger.at}} or {{trigger.lastRun}}.",
      },
    ]);
  });

  it("says which trigger has a value this one doesn't", () => {
    const input = { body: "{{trigger.body}}", subject: "{{trigger.message.subject}}" };
    expect(
      triggerValueProblems(routine(schedule, { workflow: "w", input })).map((p) => p.message),
    ).toEqual([
      "{{trigger.body}} is only set for a routine on a webhook. Use {{trigger.at}} or {{trigger.lastRun}}.",
      "{{trigger.message.subject}} is only set for a routine on mail. Use {{trigger.at}} or {{trigger.lastRun}}.",
    ]);
  });

  it("names a header the webhook doesn't pass on, and a path under at", () => {
    const input = { id: "{{trigger.headers.x-id}}", year: "{{trigger.at.year}}" };
    expect(
      triggerValueProblems(routine(webhook, { workflow: "w", input })).map((p) => p.message),
    ).toEqual([
      "{{trigger.headers.x-id}} isn't a header this webhook passes on. Add its lowercase name to trigger.webhook.headers, then use {{trigger.headers.<name>}}.",
      "{{trigger.at.year}} isn't a trigger value. Use {{trigger.at}}, {{trigger.lastRun}}, {{trigger.body}} or {{trigger.headers.<name>}}.",
    ]);
  });
});
