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

verifies("workspace.routine-input", () => {
  const workflow = (reads: string) =>
    [
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
  const load = (reads: string, input: string) =>
    loadWorkspace(
      new MemorySource({
        "workspace.yaml": "id: acme\nname: Acme\n",
        "agents/writer.agent.yaml": "name: Writer\n",
        "workflows/report.workflow.yaml": workflow(reads),
        "workflows/routines/nightly.routine.yaml": [
          "name: Nightly",
          "trigger: { schedule: '0 6 * * *' }",
          "run:",
          "  workflow: report",
          "  input:",
          `    ${input}`,
          "",
        ].join("\n"),
      }),
    );
  const routineIssues = async (reads: string, input: string) =>
    (await load(reads, input)).issues.filter((issue) => issue.file.includes("/routines/"));

  it("warns at a key no step reads, with the field it is close to", async () => {
    const issues = await routineIssues("gets: [input.day]", "dya: monday");
    expect(
      issues.map((issue) => [issue.severity, issue.code, issue.path.join("."), issue.line]),
    ).toEqual([["warning", "unread-routine-input", "run.input.dya", 6]]);
    expect(issues[0]?.message).toBe(
      'Routine "nightly": workflow "report" doesn\'t read input.dya. Did you mean input.day?',
    );
  });

  it("names the fields the steps read when no key is close", async () => {
    const issues = await routineIssues("gets: [input.day, input.team]", "region: north");
    expect(issues.map((issue) => issue.message)).toEqual([
      'Routine "nightly": workflow "report" doesn\'t read input.region. Its steps read input.day and input.team: rename the key to one of those, or remove it.',
    ]);
  });

  it("counts a field read in a prompt as read", async () => {
    const reads = "input: 'Report for {{input.day}}.'";
    expect(await routineIssues(reads, "day: monday")).toEqual([]);
  });

  it("leaves a workflow alone that sends its agent the whole input", async () => {
    expect(await routineIssues("gets: []", "dya: monday")).toEqual([]);
  });
});
