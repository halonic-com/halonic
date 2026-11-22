import { NothingToRun } from "@halonicjs/studio-feature-routines/api";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  analystFile,
  replyFile,
  setup,
  weekly,
  weeklyFile,
  weeklyRun,
} from "./workspace-routines.test-helper.ts";

verifies("studio.workspace-routines", () => {
  it("lists a routine with its words, its target and its next time", async () => {
    const { host } = setup();
    expect(await host.list()).toEqual([
      expect.objectContaining({
        hubId: "acme",
        id: "weekly-report",
        name: "Weekly report",
        enabled: true,
        summary: "Mondays at 09:00 (Europe/Amsterdam) → Analyst",
        nextRun: "2026-11-23T08:00:00.000Z",
        needsYou: 0,
      }),
    ]);
    expect(host.hubs().map((hub) => hub.id)).toEqual(["acme", "beta"]);
    expect(host.nameOf(weekly)).toBe("Weekly report");
  });

  it("counts the runs that wait, and gives an off routine no next time", async () => {
    const { host } = setup(
      {},
      [{ ...weeklyRun, status: "waiting", startedAt: "2026-11-16T08:00:00Z" }],
      {
        "hubs/acme/workflows/routines/weekly-report.routine.yaml": weeklyFile.replace(
          "name: Weekly",
          "enabled: false\nname: Weekly",
        ),
      },
    );
    const [row] = await host.list();
    expect(row?.needsYou).toBe(1);
    expect(row?.nextRun).toBeUndefined();
    expect(await host.nextTimes(weekly, 3)).toEqual({ times: [], atNextCheck: false });
  });

  it("lists a routine with a schedule that doesn't parse, with its problem", async () => {
    const { host } = setup({}, [], {
      "hubs/acme/workflows/routines/broken.routine.yaml": weeklyFile.replace("0 9 * * 1", "nope"),
    });
    const listed = (await host.list()).find((row) => row.id === "broken");
    expect(listed?.nextRun).toBeUndefined();
    const view = await host.read({ hubId: "acme", id: "broken" });
    // Once, in the checks' words, without the `Routine "<id>": ` the row and page don't need.
    expect(view.problems).toEqual(["Cron needs 5 fields (minute hour day month weekday), got 1."]);
  });

  it("lists whether the workflow or agent a routine starts is in the workspace", async () => {
    const { host } = setup({}, [], {
      "hubs/acme/workflows/routines/no-agent.routine.yaml": weeklyFile.replace(
        "agent: analyst",
        "agent: nobody",
      ),
      "hubs/acme/workflows/routines/no-workflow.routine.yaml": weeklyFile.replace(
        "  agent: analyst\n  prompt: Write the report.",
        "  workflow: support-reply",
      ),
    });
    const listed = await host.list();
    const row = (id: string) => listed.find((each) => each.id === id);

    expect(row("weekly-report")).toMatchObject({ targetFound: true, problems: [] });
    expect(row("no-agent")).toMatchObject({
      targetKind: "agent",
      targetFound: false,
      targetName: "nobody",
    });
    expect(row("no-workflow")).toMatchObject({
      targetKind: "workflow",
      targetFound: false,
      targetName: "support-reply",
    });
  });

  it("lists the errors in a routine's file, such as a value its trigger doesn't have", async () => {
    const { host } = setup({}, [], {
      "hubs/acme/workflows/routines/weekly-report.routine.yaml": weeklyFile.replace(
        "Write the report.",
        "Write the report for {{trigger.date}}.",
      ),
    });

    const [listed] = await host.list();

    // C540 #4 (HAL-15082): `halonic routines` says it can't start, so the Studio list must too.
    expect(listed?.targetFound).toBe(true);
    // The row names the routine already, so the line starts with the problem, not `Routine "<id>": `.
    expect(listed?.problems).toEqual([
      expect.stringMatching(/^\{\{trigger\.date\}\} isn't a trigger value/),
    ]);
    // HAL-15300: the page gets the same errors, so its Starts card says what the row says.
    expect((await host.read(weekly)).problems).toEqual(listed?.problems);
  });

  it("reads a routine as the page draws it", async () => {
    const { host } = setup();
    const view = await host.read(weekly);
    expect(view).toMatchObject({
      summary: "Mondays at 09:00 (Europe/Amsterdam) → Analyst",
      targetName: "Analyst",
      trigger: { kind: "schedule", cron: "0 9 * * 1", timeZone: "Europe/Amsterdam" },
      target: { kind: "agent", hubId: "acme", id: "analyst", prompt: "Write the report." },
      targetState: "ready",
      overlap: "skip",
      catchUp: "last",
      file: "hubs/acme/workflows/routines/weekly-report.routine.yaml",
      everLive: true,
      changesNotLive: false,
    });
  });

  it("says whether what a routine starts runs a program, through the workflow's agents", async () => {
    const coder = "id: coder\nname: Coder\nharness: claude-code\n";
    const startsReply = weeklyFile.replace(
      "  agent: analyst\n  prompt: Write the report.",
      "  workflow: reply",
    );
    const own = setup();
    expect((await own.host.read(weekly)).startsProgram).toBe(false);
    const agent = setup({}, [], {
      "hubs/acme/agents/analyst.agent.yaml": `${analystFile}harness: codex\n`,
    });
    // An agent on its own can't run yet, so Run now gives that reason, not the sandbox's (HAL-14848).
    expect((await agent.host.read(weekly)).startsProgram).toBe(false);
    const workflow = setup({}, [], {
      "hubs/acme/agents/coder.agent.yaml": coder,
      "hubs/acme/workflows/reply.workflow.yaml":
        "id: reply\nname: Reply\ninitial: first\nstates:\n  first:\n    agent: coder\n    on: [{ to: done }]\n  done:\n    type: final\n",
      "hubs/acme/workflows/routines/weekly-report.routine.yaml": startsReply,
    });
    expect((await workflow.host.read(weekly)).startsProgram).toBe(true);
  });

  it("rejects a routine the workspace doesn't have as not found", async () => {
    const { host } = setup();
    await expect(host.read({ hubId: "acme", id: "gone" })).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("writes a change as an edit that keeps the file's comments", async () => {
    const { host, store, changes } = setup();
    await host.save(weekly, { name: "Monday report", enabled: false, overlap: "queue" });
    const text = store["hubs/acme/workflows/routines/weekly-report.routine.yaml"];
    expect(text).toContain("# Sent to the team.");
    expect(text).toContain("Monday report");
    expect(text).toContain("enabled: false");
    expect(text).toContain("overlap: queue");
    expect(changes).toHaveLength(1);
    expect(host.nameOf(weekly)).toBe("Monday report");
  });

  it("writes a new trigger and a new target", async () => {
    const { host } = setup();
    await host.save(weekly, {
      trigger: { kind: "every", interval: "15m" },
      target: { kind: "workflow", hubId: "acme", id: "reply", input: '{"a":1}' },
    });
    const view = await host.read(weekly);
    expect(view.trigger).toEqual({ kind: "every", interval: "15m" });
    expect(view.target).toMatchObject({ kind: "workflow", id: "reply", input: '{\n  "a": 1\n}' });
  });

  it("refuses an input that isn't a JSON object, and writes nothing", async () => {
    const { host, changes } = setup();
    await expect(
      host.save(weekly, { target: { kind: "workflow", hubId: "acme", id: "reply", input: "[1]" } }),
    ).rejects.toThrow(SyntaxError);
    expect(changes).toEqual([]);
  });

  it("lists the next times of a schedule, and of an interval once it has run", async () => {
    const { host } = setup();
    const { times } = await host.nextTimes(weekly, 2);
    expect(times).toEqual(["2026-11-23T08:00:00.000Z", "2026-11-30T08:00:00.000Z"]);
    const every = {
      "hubs/acme/workflows/routines/poll.routine.yaml": weeklyFile.replace(
        /schedule:.*\n {2}timezone:.*\n/,
        "every: 1h\n",
      ),
    };
    const poll = { hubId: "acme", id: "poll" };
    expect(await setup({}, [], every).host.nextTimes(poll, 2)).toEqual({
      times: [],
      atNextCheck: true,
    });
    const ran = [
      {
        kind: "run" as const,
        status: "completed" as const,
        startedAt: "2026-11-17T07:00:00Z",
        trigger: { type: "every" as const, routineId: "acme/poll", at: "2026-11-17T07:00:00Z" },
      },
    ];
    expect((await setup({}, ran, every).host.nextTimes(poll, 2)).times).toEqual([
      "2026-11-17T09:00:00.000Z",
      "2026-11-17T10:00:00.000Z",
    ]);
  });

  it("lists the newest runs, newest first, with the skipped times", async () => {
    const { host } = setup(
      {
        skips: async () => [
          { reason: "missed", from: "2026-11-09T08:00:00Z", to: "2026-11-09T08:00:00Z", count: 1 },
          {
            reason: "target-unavailable",
            why: "in-trash",
            from: "2026-11-02T08:00:00Z",
            to: "2026-11-02T08:00:00Z",
            count: 1,
          },
          {
            reason: "start-refused",
            sentence: "This window can't run Briefing.",
            fix: "Open Acme in Studio, then try again.",
            from: "2026-11-01T08:00:00Z",
            to: "2026-11-01T08:00:00Z",
            count: 1,
          },
          { reason: "start-refused", from: "2026-10-31T08:00Z", to: "2026-10-31T08:00Z", count: 1 },
        ],
      },
      [
        { ...weeklyRun, id: "old", status: "completed", startedAt: "2026-11-09T08:00:00Z" },
        { ...weeklyRun, id: "new", status: "failed", startedAt: "2026-11-16T08:00:00Z" },
        { kind: "run", id: "other", status: "completed", startedAt: "2026-11-16T09:00:00Z" },
      ],
    );
    const { runs, skips } = await host.runs(weekly);
    expect(runs.map((run) => [run.runId, run.outcome, run.startedBy])).toEqual([
      ["new", "failed", "schedule"],
      ["old", "completed", "schedule"],
    ]);
    expect(skips.map(({ reason, sentence, fix }) => [reason, sentence, fix])).toEqual([
      ["missed", undefined, undefined],
      ["target-in-trash", undefined, undefined],
      ["start-refused", "This window can't run Briefing.", "Open Acme in Studio, then try again."],
      ["start-refused", undefined, undefined],
    ]);
  });

  it("names what a routine starts, for the line that says what deleting it stops", async () => {
    const { host } = setup();
    const [row] = await host.list();
    expect(row?.targetName).toBe("Analyst");
  });

  it("creates a manual routine that runs the hub's first workflow", async () => {
    const { host, store } = setup();
    const ref = await host.create({ name: "Morning check", hubId: "acme" });
    expect(ref).toEqual({ hubId: "acme", id: "morning-check" });
    const view = await host.read(ref);
    expect(view.trigger).toEqual({ kind: "manual" });
    expect(view.target).toMatchObject({ kind: "workflow", id: "reply", input: "{}" });
    expect(store["hubs/acme/workflows/routines/morning-check.routine.yaml"]).toContain(
      '"Morning check"',
    );
    expect((await host.create({ name: "Morning check", hubId: "acme" })).id).toBe(
      "morning-check-2",
    );
  });

  it("creates a routine that runs the first agent only with a prompt when the hub has no workflow", async () => {
    const { host, store, changes } = setup();
    delete store["hubs/acme/workflows/reply.workflow.yaml"];
    const refused = "Say what Analyst should do.";
    await expect(host.create({ name: "Check", hubId: "acme" })).rejects.toThrow(refused);
    await expect(host.create({ name: "Check", hubId: "acme", prompt: "  " })).rejects.toThrow(
      refused,
    );
    expect(changes).toEqual([]);
    const ref = await host.create({ name: "Check", hubId: "acme", prompt: "Sum up the inbox" });
    const view = await host.read(ref);
    expect(view.target).toMatchObject({ kind: "agent", prompt: "Sum up the inbox" });
  });

  it("names what a new routine would run: the first workflow, else the first agent, else nothing", async () => {
    const { host, store } = setup();
    expect(await host.starterTarget("acme")).toMatchObject({ kind: "workflow", id: "reply" });
    delete store["hubs/acme/workflows/reply.workflow.yaml"];
    expect(await host.starterTarget("acme")).toMatchObject({ kind: "agent" });
    expect(await host.starterTarget("beta")).toBeUndefined();
  });

  it("offers a workflow with the field its start block asks for, and an agent without one", async () => {
    const { host } = setup({}, [], {
      "hubs/acme/workflows/reply.workflow.yaml": `${replyFile}start:\n  label: Answer a customer's email\n  field: mail\n`,
    });
    expect(await host.targets(weekly)).toEqual([
      {
        kind: "workflow",
        hubId: "acme",
        id: "reply",
        name: "Reply",
        start: { label: "Answer a customer's email", field: "mail" },
      },
      { kind: "agent", hubId: "acme", id: "analyst", name: "Analyst" },
    ]);
  });

  it("refuses a hub with nothing to run, or a hub the workspace doesn't have, and writes nothing", async () => {
    const { host, changes } = setup();
    await expect(host.create({ name: "Check", hubId: "beta" })).rejects.toThrow(NothingToRun);
    await expect(host.create({ name: "Check", hubId: "zed" })).rejects.toThrow("no hub");
    expect(changes).toEqual([]);
  });

  it("lists the Google connectors a routine can watch, the hub's own first, then the shared ones", async () => {
    const google = (name: string, account: string) =>
      `name: ${name}\ntransport:\n  google:\n    account: ${account}\n`;
    const { host } = setup({}, [], {
      "workspace.yaml": "id: team\nname: Team\n",
      "library/connectors/shared-mail.connector.yaml": google("Shared mail", "team@example.com"),
      "hubs/acme/library/connectors/acme-gmail.connector.yaml": google(
        "Acme Gmail",
        "me@example.com",
      ),
      "hubs/acme/library/connectors/notes.connector.yaml":
        "name: Notes\ntransport:\n  http:\n    url: https://mcp.example.com\n",
      "hubs/beta/library/connectors/beta-gmail.connector.yaml": google(
        "Beta Gmail",
        "b@example.com",
      ),
    });
    expect(await host.mailboxes(weekly)).toEqual([
      { connector: "acme-gmail", name: "Acme Gmail", account: "me@example.com" },
      { connector: "shared-mail", name: "Shared mail", account: "team@example.com" },
    ]);
  });

  it("lists the routines that start an owner, and adds one named after it", async () => {
    const { host } = setup();
    expect(
      (await host.startingRoutines({ kind: "agent", hubId: "acme", id: "analyst" })).map(
        (row) => row.id,
      ),
    ).toEqual(["weekly-report"]);
    expect(await host.startingRoutines({ kind: "workflow", hubId: "acme", id: "reply" })).toEqual(
      [],
    );
    const ref = await host.addTrigger({ kind: "workflow", hubId: "acme", id: "reply" });
    expect(ref.id).toBe("reply");
    expect(
      await host.startingRoutines({ kind: "workflow", hubId: "acme", id: "reply" }),
    ).toHaveLength(1);
  });

  it("adds a trigger on an agent only with the prompt the person typed", async () => {
    const { host, store, changes } = setup();
    const analyst = { kind: "agent", hubId: "acme", id: "analyst" } as const;
    expect(await host.ownerName(analyst)).toBe("Analyst");
    await expect(host.addTrigger(analyst)).rejects.toThrow("Say what Analyst should do.");
    await expect(host.addTrigger(analyst, " ")).rejects.toThrow("Say what Analyst should do.");
    expect(changes).toEqual([]);
    const ref = await host.addTrigger(analyst, "Sum up the inbox");
    expect(ref.id).toBe("analyst");
    expect(store["hubs/acme/workflows/routines/analyst.routine.yaml"]).toBeDefined();
    expect((await host.read(ref)).target).toMatchObject({
      kind: "agent",
      id: "analyst",
      prompt: "Sum up the inbox",
    });
  });

  it("tells a subscriber when a file changed or a run started, and not after it stopped", () => {
    const { host, fileListeners, runListeners } = setup();
    let heard = 0;
    const stop = host.subscribe(() => heard++);
    for (const listener of [...fileListeners, ...runListeners]) listener();
    expect(heard).toBe(2);
    stop();
    expect(fileListeners.size + runListeners.size).toBe(0);
  });
});
