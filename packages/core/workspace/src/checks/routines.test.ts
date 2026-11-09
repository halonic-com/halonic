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
];

verifies("workspace.routines", () => {
  it.each(routineCases)(
    "gives %s the old loader's error, at the key path and line of the name",
    async (caseId) => {
      expect(await errorsOf(caseId)).toEqual([expectedError(caseId)]);
    },
    parityLoadLimitMs,
  );

  it(
    "points a missing run.hub at the run map, a line below where routine/no-hub expects it",
    async () => {
      // The case file names the line of the `run:` key (5). A missing key
      // points at its map in every file (the yaml package's rule), so line 6.
      const { file, path, message } = expectedError("routine/no-hub");
      expect(await errorsOf("routine/no-hub")).toEqual([{ file, path, line: 6, message }]);
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
});
