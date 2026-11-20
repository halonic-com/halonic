import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { loadWorkspace } from "../index.ts";
import { MemorySource } from "../test/memory-source.ts";
import {
  errorsOf,
  expectedError,
  parityLoadLimitMs,
  readParityCase,
} from "../test/parity-cases.spec.ts";

// Each case breaks one thing a routine names; the issue sits where its case file says.
const routineCases = [
  "routine/unknown-hub",
  "routine/unknown-workflow",
  "routine/unknown-agent",
  "routine/other-hub",
  "routine/mail-unknown-connector",
  "routine/mail-not-google",
  "routine/no-hub",
];

verifies("workspace.routines", () => {
  it.each(routineCases)(
    "gives %s the old loader's error, at the key path and line the case file names",
    async (caseId) => {
      expect(await errorsOf(caseId)).toEqual([expectedError(caseId)]);
    },
    parityLoadLimitMs,
  );

  it(
    "reports a cron that doesn't parse with the routines package's message",
    async () => {
      const file = "hubs/billing/workflows/routines/month-end.routine.yaml";
      expect(await errorsOf("routine/bad-cron")).toEqual([
        {
          file,
          path: "trigger.schedule",
          line: 4,
          message: 'Routine "month-end": Minute: "61" is outside 0-59.',
        },
      ]);
    },
    parityLoadLimitMs,
  );

  it(
    "reports an unknown time zone",
    async () => {
      const file = "hubs/billing/workflows/routines/month-end.routine.yaml";
      expect(await errorsOf("routine/bad-timezone")).toEqual([
        {
          file,
          path: "trigger.timezone",
          line: 5,
          message: 'Routine "month-end": Unknown time zone "Mars/Olympus".',
        },
      ]);
    },
    parityLoadLimitMs,
  );

  it(
    "calls a hub whose hub.yaml failed unknown, and leaves that hub's own routines alone",
    async () => {
      const workspace = await loadWorkspace(readParityCase("hub/wrong-type").source);
      const routineErrors = workspace.issues
        .filter((issue) => issue.source === "check" && issue.file.includes("/routines/"))
        .map((issue) => `${issue.file}: ${issue.message}`);
      expect(routineErrors).toEqual([
        'workflows/routines/hourly-check.routine.yaml: Routine "hourly-check": unknown hub "billing"',
        'workflows/routines/on-paid.routine.yaml: Routine "on-paid": unknown hub "billing"',
      ]);
    },
    parityLoadLimitMs,
  );

  it("lets a root routine without run.hub run the root's own agents", async () => {
    const workspace = await loadWorkspace(
      new MemorySource({
        "workspace.yaml": "id: acme\nname: Acme\n",
        "agents/helper.agent.yaml": "name: Helper\n",
        "workflows/routines/daily.routine.yaml":
          "name: Daily\ntrigger: { schedule: '@daily' }\nrun: { agent: helper, prompt: Hello. }\n",
      }),
    );
    expect(workspace.issues).toEqual([]);
  });

  it("refuses a root webhook routine without run.hub, even when the root has agents", async () => {
    const workspace = await loadWorkspace(
      new MemorySource({
        "workspace.yaml": "id: acme\nname: Acme\n",
        "agents/helper.agent.yaml": "name: Helper\n",
        "workflows/routines/hook.routine.yaml":
          "name: Hook\ntrigger: { webhook: { secret: HOOK } }\nrun: { agent: helper, prompt: Hello. }\n",
      }),
    );
    expect(workspace.issues.map((issue) => [issue.code, issue.path])).toEqual([
      ["webhook-routine-without-hub", ["run", "hub"]],
    ]);
  });

  it("lets a root webhook routine name its hub in run.hub", async () => {
    const workspace = await loadWorkspace(
      new MemorySource({
        "workspace.yaml": "id: acme\nname: Acme\n",
        "hubs/billing/hub.yaml": "name: Billing\n",
        "hubs/billing/agents/clerk.agent.yaml": "name: Clerk\n",
        "workflows/routines/hook.routine.yaml":
          "name: Hook\ntrigger: { webhook: { secret: HOOK } }\nrun: { agent: clerk, hub: billing, prompt: Hello. }\n",
      }),
    );
    expect(workspace.issues).toEqual([]);
  });
});

/** A workspace whose routine Nightly runs Report, whose one step `reads` and gets `input`. */
function nightlyRoutine(reads: string, input: string) {
  const workflow = [
    "name: Report",
    "initial: write",
    "states:",
    "  write:",
    "    agent: writer",
    `    ${reads}`,
    "    on: [{ to: done }]",
    "  done: { type: final }",
    "",
  ].join("\n");
  return loadWorkspace(
    new MemorySource({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "agents/writer.agent.yaml": "name: Writer\n",
      "workflows/report.workflow.yaml": workflow,
      "workflows/routines/nightly.routine.yaml": [
        "name: Nightly",
        "trigger: { schedule: '0 6 * * *' }",
        "run:",
        "  workflow: report",
        ...(input === "" ? [] : ["  input:", `    ${input}`]),
        "",
      ].join("\n"),
    }),
  );
}

/** The routine's issues with `code`. */
async function routineIssues(reads: string, input: string, code: string) {
  const workspace = await nightlyRoutine(reads, input);
  return workspace.issues.filter((issue) => issue.code === code);
}

verifies("workspace.routine-input", () => {
  const unread = (reads: string, input: string) =>
    routineIssues(reads, input, "unread-routine-input");

  it("warns at a key no step reads, with the field it is close to", async () => {
    const issues = await unread("gets: [input.day]", "dya: monday");
    expect(
      issues.map((issue) => [issue.severity, issue.code, issue.path.join("."), issue.line]),
    ).toEqual([["warning", "unread-routine-input", "run.input.dya", 6]]);
    expect(issues[0]?.message).toBe(
      'Routine "nightly": workflow "report" doesn\'t read input.dya. Did you mean input.day?',
    );
  });

  it("names the fields the steps read when no key is close", async () => {
    const issues = await unread("gets: [input.day, input.team]", "region: north");
    expect(issues.map((issue) => issue.message)).toEqual([
      'Routine "nightly": workflow "report" doesn\'t read input.region. Its steps read input.day and input.team: rename the key to one of those, or remove it.',
    ]);
  });

  it("counts a field read in a prompt as read", async () => {
    const reads = "input: 'Report for {{input.day}}.'";
    expect(await unread(reads, "day: monday")).toEqual([]);
  });

  it("leaves a workflow alone that sends its agent the whole input", async () => {
    expect(await unread("gets: []", "dya: monday")).toEqual([]);
  });
});

verifies("workspace.routine-start-input", () => {
  const missing = (reads: string, input: string) =>
    routineIssues(reads, input, "missing-routine-input");

  it("fails at run.input when the input lacks a field the first step reads", async () => {
    const issues = await missing("input: 'Write about: {{input.topic}}'", "");
    expect(
      issues.map((issue) => [issue.severity, issue.path.join("."), issue.line, issue.message]),
    ).toEqual([
      [
        "error",
        "run.input",
        3,
        "Nightly starts report without topic, which its first step reads. Add topic under run.input.",
      ],
    ]);
  });

  it("names every missing field, next to the key it doesn't read", async () => {
    const issues = await missing("gets: [input.day, input.team]", "dya: monday");
    expect(issues.map((issue) => [issue.path.join("."), issue.message])).toEqual([
      [
        "run.input",
        "Nightly starts report without day and team, which its first step reads. Add day and team under run.input.",
      ],
    ]);
  });

  it("counts a {{trigger.…}} template as a given field", async () => {
    expect(await missing("gets: [input.day]", "day: '{{trigger.at}}'")).toEqual([]);
  });

  it("leaves a workflow alone that sends its agent the whole input", async () => {
    expect(await missing("gets: []", "")).toEqual([]);
  });
});

verifies("workspace.routine-start-checks", () => {
  const files = (routine: string) =>
    new MemorySource({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "hubs/news/hub.yaml": "name: News\n",
      "hubs/news/workflows/digest.workflow.yaml":
        "name: Digest\ninitial: done\nstates:\n  done: { type: final }\n",
      "hubs/news/workflows/routines/friday.routine.yaml": routine,
    });

  it("reports each placeholder that isn't a value of the trigger, at its input key and line", async () => {
    const workspace = await loadWorkspace(
      files(
        'name: Friday\ntrigger: { every: 1h }\nrun:\n  workflow: digest\n  input: { day: "{{trigger.date}}", body: "{{trigger.body}}", at: "{{trigger.at}}" }\n',
      ),
    );
    // The digest reads no input, so the unread-input warnings (HAL-14316) are left out here.
    const errors = workspace.issues.filter((issue) => issue.severity === "error");
    expect(errors.map((issue) => [issue.severity, issue.code, issue.path, issue.line])).toEqual([
      ["error", "unknown-trigger-value", ["run", "input", "day"], 5],
      ["error", "unknown-trigger-value", ["run", "input", "body"], 5],
    ]);
    expect(errors[1]?.message).toBe(
      'Routine "friday": {{trigger.body}} is only set for a routine on a webhook. Use {{trigger.at}} or {{trigger.lastRun}}.',
    );
  });
});
