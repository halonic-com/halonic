import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { replyFile, setup } from "./workspace-workflows.test-helper.ts";

const reply = { hubId: "acme", id: "reply" } as const;
const replyPath = "hubs/acme/workflows/reply.workflow.yaml";
const testPath = "hubs/acme/workflows/reply.test.yaml";
const testText = "version: 1\nworkflow: reply\ncases:\n  - name: spam\n    input: {}\n";

/** A routine that runs the workflow `reply`, of its own hub or of `hub`. */
const routineRunning = (hub?: string) =>
  [
    "name: Hourly",
    "trigger:",
    "  every: 1h",
    "run:",
    ...(hub === undefined ? [] : [`  hub: ${hub}`]),
    "  workflow: reply",
    "",
  ].join("\n");

verifies("studio.workspace-workflow-trash", () => {
  it("takes the workflow's file and its test file out in one change", async () => {
    const { host, store, changes } = setup();
    store[testPath] = testText;

    await host.trash(reply);

    expect(changes).toEqual([
      { label: "Deleted workflow Reply", changes: { [replyPath]: null, [testPath]: null } },
    ]);
    expect(store[replyPath]).toBeUndefined();
    expect(store[testPath]).toBeUndefined();
  });

  it("puts both files back with its undo while the delete is the newest change", async () => {
    const { host, store } = setup();
    store[testPath] = testText;

    const trashed = await host.trash(reply);
    await trashed.undo();

    expect(store[replyPath]).toBe(replyFile);
    expect(store[testPath]).toBe(testText);
  });

  it("refuses its undo after another change, and undoes nothing", async () => {
    const { host, store } = setup();
    store["hubs/acme/workflows/triage.workflow.yaml"] = replyFile
      .replace("id: reply", "id: triage")
      .replace("name: Reply", "name: Triage");

    const trashed = await host.trash(reply);
    await host.rename({ hubId: "acme", id: "triage" }, "Mail triage");

    await expect(trashed.undo()).rejects.toMatchObject({
      kind: "conflict",
      message: "Reply can't be put back, because the workspace changed after it was deleted.",
    });
    expect(store[replyPath]).toBeUndefined();
    expect(store["hubs/acme/workflows/triage.workflow.yaml"]).toContain("name: Mail triage");
  });

  it("refuses a workflow the hub doesn't have and writes nothing", async () => {
    const { host, changes } = setup();

    await expect(host.trash({ hubId: "acme", id: "gone" })).rejects.toMatchObject({
      kind: "not_found",
      message: "This workflow isn't in this workspace any more.",
    });
    expect(changes).toEqual([]);
  });

  it("counts the routines that start the workflow and the other workflows' steps that run it", async () => {
    const { host, store } = setup();
    store["hubs/acme/workflows/routines/hourly.routine.yaml"] = routineRunning();
    store["workflows/routines/nightly.routine.yaml"] = routineRunning("acme");
    // Beta's routine runs beta's own `reply`, not acme's.
    store["hubs/beta/workflows/routines/hourly.routine.yaml"] = routineRunning();
    store["hubs/acme/workflows/triage.workflow.yaml"] = [
      "id: triage",
      "name: Triage",
      "initial: first",
      "states:",
      "  first:",
      "    type: workflow",
      "    workflow: reply",
      "    on:",
      "      - to: each",
      "  each:",
      "    type: foreach",
      "    workflow: reply",
      "    items: input.mails",
      "    on:",
      "      - to: done",
      "  ask:",
      "    workflow: reply",
      "    on:",
      "      - to: done",
      "  done:",
      "    type: final",
      "",
    ].join("\n");

    // `ask` is an agent step: the engine ignores its `workflow`, so it shows no error and doesn't count.
    expect(await host.referencesTo(reply)).toEqual({ routines: 2, steps: 2 });
  });
});
