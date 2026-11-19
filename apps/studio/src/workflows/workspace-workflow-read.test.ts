import type { RunEvent } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { setup } from "./workspace-workflows.test-helper.ts";

const reply = { hubId: "acme", workflowId: "reply", kind: "run" } as const;

verifies("studio.workspace-workflow-read", () => {
  it("reads one workflow's steps, arrows and places, with unsaved changes applied", async () => {
    const { host, store } = setup();
    store["hubs/acme/workflows/reply.workflow.yaml"] = [
      "id: reply",
      "name: Reply",
      "initial: first",
      "states:",
      "  first:",
      "    agent: writer",
      "    description: |",
      "      Read the email",
      "      {{context.email}}",
      "    on:",
      "      - to: done",
      "        label: ok",
      "  done:",
      "    type: final",
      "layout:",
      "  done: { x: 5, y: 7 }",
      "",
    ].join("\n");

    expect(await host.read({ hubId: "acme", id: "reply" })).toEqual({
      hubId: "acme",
      id: "reply",
      name: "Reply",
      initial: "first",
      steps: [
        {
          id: "first",
          type: "task",
          title: "Read the email",
          agent: "writer",
          description: "Read the email\n{{context.email}}\n",
          promptIsData: false,
        },
        { id: "done", type: "final", agent: undefined, promptIsData: false },
      ],
      arrows: [{ from: "first", to: "done", label: "ok" }],
      layout: { done: { x: 5, y: 7 } },
      agents: [],
    });
  });

  it("names the first agent each step runs in a program of its own", async () => {
    const { host, store } = setup();
    store["hubs/acme/agents/reader.agent.yaml"] = "id: reader\nname: Reader\n";
    store["hubs/acme/agents/writer.agent.yaml"] =
      "id: writer\nname: Writer\nharness: claude-code\n";
    store["hubs/acme/agents/sorter.agent.yaml"] = "id: sorter\nname: Sorter\nharness: codex\n";
    store["hubs/acme/workflows/reply.workflow.yaml"] = [
      "id: reply",
      "name: Reply",
      "initial: first",
      "states:",
      "  first:",
      "    agent: reader",
      "    on: [{ to: draft }]",
      "  draft:",
      "    agent: writer",
      "    on: [{ to: check }]",
      "  check:",
      "    type: parallel",
      "    branches:",
      "      read: { agent: reader }",
      "      sort: { agent: sorter }",
      "    on: [{ to: done }]",
      "  done:",
      "    type: final",
      "",
    ].join("\n");

    const { steps } = await host.read({ hubId: "acme", id: "reply" });

    expect(Object.fromEntries(steps.map((step) => [step.id, step.program]))).toEqual({
      first: undefined,
      draft: { agent: "writer", agentName: "Writer", harness: "claude-code" },
      check: { agent: "sorter", agentName: "Sorter", harness: "codex" },
      done: undefined,
    });
  });

  it("refuses a workflow the hub doesn't have as not found", async () => {
    const { host } = setup();
    await expect(host.read({ hubId: "acme", id: "gone" })).rejects.toThrow(
      "This workflow isn't in this workspace any more.",
    );
  });

  it("gives a workflow's settings and the problems of its file, each with its step", async () => {
    const { host, store } = setup();
    store["hubs/acme/workflows/reply.workflow.yaml"] =
      "id: reply\nname: Reply\ndescription: Answers\ninitial: first\nstates:\n  first:\n    on:\n      - to: nowhere\n";

    const settings = await host.configuration({ hubId: "acme", id: "reply" });

    expect(settings).toMatchObject({
      name: "Reply",
      description: "Answers",
      initial: "first",
      stepIds: ["first"],
      file: "hubs/acme/workflows/reply.workflow.yaml",
    });
    expect(settings.problems.map(({ code, stepId }) => ({ code, stepId }))).toContainEqual({
      code: "unknown-target",
      stepId: "first",
    });
  });

  it("gives the request form's one field by name only, without a made-up type or flag", async () => {
    const { host, store } = setup();
    store["hubs/acme/workflows/reply.workflow.yaml"] =
      "id: reply\nname: Reply\ninitial: first\nstart:\n  label: Ask a question\n  field: question\nstates:\n  first:\n    type: final\n";

    const settings = await host.configuration({ hubId: "acme", id: "reply" });

    expect(settings.request).toEqual({ label: "Ask a question", fields: [{ name: "question" }] });
  });

  it("rejects the settings of a workflow the hub doesn't have", async () => {
    await expect(setup().host.configuration({ hubId: "acme", id: "gone" })).rejects.toThrow(
      "This workflow isn't in this workspace any more.",
    );
  });

  it("lists the cases of a workflow's test file, with its input and where it should end", async () => {
    const { host, store } = setup();
    store["hubs/acme/workflows/reply.test.yaml"] =
      'version: 1\nworkflow: reply\ncases:\n  - name: spam\n    input: { subject: "Win" }\n    expect: { final: first }\n  - name: other\n';

    const tests = await host.tests({ hubId: "acme", id: "reply" });

    expect(tests.cases.map(({ name, endsIn }) => ({ name, endsIn }))).toEqual([
      { name: "spam", endsIn: "first" },
      { name: "other", endsIn: undefined },
    ]);
    expect(tests.cases[0]?.input).toBe('{\n  "subject": "Win"\n}');
    expect(tests.cases[0]?.result).toBeUndefined();
  });

  it("gives no tests for a workflow without a test file, and rejects one that isn't there", async () => {
    const { host } = setup();

    expect((await host.tests({ hubId: "acme", id: "reply" })).cases).toEqual([]);
    await expect(host.tests({ hubId: "acme", id: "gone" })).rejects.toThrow(
      "isn't in this workspace any more",
    );
  });

  describe("saving a run as a test", () => {
    const run = { ...reply, id: "r1", status: "completed", state: "first" } as const;
    const logs = (input: Record<string, unknown> = { topic: "refund" }) => ({
      r1: [{ type: "run.started", input } as unknown as RunEvent],
    });

    it("makes the test file when the workflow has none", async () => {
      const { host, store, changes } = setup([run], logs());

      await host.saveRunAsTest({ hubId: "acme", id: "reply" }, "r1", "Refund");

      expect(changes).toHaveLength(1);
      expect(store["hubs/acme/workflows/reply.test.yaml"]).toBe(
        [
          "version: 1",
          "workflow: reply",
          "cases:",
          "  - name: Refund",
          "    input:",
          "      topic: refund",
          "    expect:",
          "      final: first",
          "",
        ].join("\n"),
      );
      expect((await host.tests({ hubId: "acme", id: "reply" })).cases).toEqual([
        { name: "Refund", input: '{\n  "topic": "refund"\n}', endsIn: "first" },
      ]);
    });

    it("adds the case after the ones the file has and keeps its comments", async () => {
      const { host, store } = setup([run], logs());
      store["hubs/acme/workflows/reply.test.yaml"] = [
        "version: 1",
        "workflow: reply",
        "cases:",
        "  # the happy path",
        "  - name: Happy",
        "    expect:",
        "      final: first",
        "",
      ].join("\n");

      await host.saveRunAsTest({ hubId: "acme", id: "reply" }, "r1", "Refund");

      const text = store["hubs/acme/workflows/reply.test.yaml"] ?? "";
      expect(text).toContain("# the happy path");
      expect(
        (await host.tests({ hubId: "acme", id: "reply" })).cases.map((one) => one.name),
      ).toEqual(["Happy", "Refund"]);
    });

    it("rejects a name another case has, and changes nothing", async () => {
      const { host, changes } = setup([run], logs());
      await host.saveRunAsTest({ hubId: "acme", id: "reply" }, "r1", "Refund");

      await expect(
        host.saveRunAsTest({ hubId: "acme", id: "reply" }, "r1", "Refund"),
      ).rejects.toThrow('already has a test case called "Refund"');
      expect(changes).toHaveLength(1);
    });

    it("rejects a run it has no log for, a run of another workflow and a run with no step", async () => {
      const { host, changes } = setup(
        [run, { ...run, id: "r2", workflowId: "other" }, { ...run, id: "r3", state: null }],
        { ...logs(), r2: logs().r1, r3: logs().r1 },
      );
      const ref = { hubId: "acme", id: "reply" };

      await expect(host.saveRunAsTest(ref, "nope", "A")).rejects.toThrow("no log");
      await expect(host.saveRunAsTest(ref, "r2", "A")).rejects.toThrow("not a run of");
      await expect(host.saveRunAsTest(ref, "r3", "A")).rejects.toThrow("no step");
      expect(changes).toEqual([]);
    });

    it("rejects a workflow the hub doesn't have", async () => {
      const { host } = setup([run], logs());

      await expect(host.saveRunAsTest({ hubId: "acme", id: "gone" }, "r1", "A")).rejects.toThrow(
        "isn't in this workspace any more",
      );
    });
  });
});
