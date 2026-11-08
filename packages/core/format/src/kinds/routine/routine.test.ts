import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.ts";

const routine = (...lines: string[]) => yaml("id: hourly", "name: Hourly", ...lines);

verifies("format.routine-file", () => {
  it("fills in enabled, overlap, catch-up and the workflow input", () => {
    expect(
      parsedValue("routine", routine("trigger: { every: 1h }", "run: { workflow: invoice }")),
    ).toEqual({
      version: 1,
      id: "hourly",
      name: "Hourly",
      enabled: true,
      trigger: { every: "1h" },
      run: { workflow: "invoice", input: {} },
      overlap: "skip",
      catchUp: "last",
    });
  });

  it("accepts a schedule, a manual start, a signal with a guard and an agent run", () => {
    const runAgent = "run: { agent: clerk, prompt: Check the inbox }";
    expect(
      parsedValue(
        "routine",
        routine("trigger: { schedule: '0 9 * * 1', timezone: Europe/Amsterdam }", runAgent),
      ).trigger,
    ).toEqual({
      schedule: "0 9 * * 1",
      timezone: "Europe/Amsterdam",
    });
    expect(parsedValue("routine", routine("trigger: { manual: true }", runAgent)).trigger).toEqual({
      manual: true,
    });
    const signal = "trigger: { signal: { name: paid, when: { exists: trigger.signal.id } } }";
    expect(parsedValue("routine", routine(signal, runAgent)).trigger).toEqual({
      signal: { name: "paid", when: { exists: "trigger.signal.id" } },
    });
  });

  it("refuses an interval without a unit, at the trigger", () => {
    const text = routine("trigger: { every: 15 }", "run: { workflow: invoice }");
    expect(summary(problemsOf("routine", text))).toEqual(["trigger invalid_union 3"]);
  });

  it("refuses a run with neither a workflow nor an agent, and an unknown overlap", () => {
    const text = routine("trigger: { manual: true }", "run: { hub: billing }", "overlap: wait");
    expect(summary(problemsOf("routine", text))).toEqual([
      "run invalid_union 4",
      "overlap invalid_value 5",
    ]);
  });
});

verifies("format.routine-mail-interval", () => {
  const mail = (every?: string) =>
    routine(
      "trigger:",
      "  mail:",
      "    connector: mailbox",
      ...(every === undefined ? [] : [`    every: ${every}`]),
      "run: { workflow: triage }",
    );

  it("fills in the query and a 2m interval", () => {
    expect(parsedValue("routine", mail()).trigger).toEqual({
      mail: { connector: "mailbox", query: "in:inbox", every: "2m" },
    });
  });

  it.each(["15m", "1d", "90m", "12h"])("accepts a mail interval of %s", (every) => {
    expect(parsedValue("routine", mail(every)).trigger).toMatchObject({ mail: { every } });
  });

  it.each(["0m", "15s", "1dd", "'15'"])(
    "refuses a mail interval of %s, at the interval",
    (every) => {
      expect(summary(problemsOf("routine", mail(every)))).toEqual([
        "trigger.mail.every invalid_format 6",
      ]);
    },
  );

  it("refuses an interval that is a number, at the trigger", () => {
    expect(summary(problemsOf("routine", mail("15")))).toEqual(["trigger invalid_union 4"]);
  });
});
