import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { setup } from "./workspace-workflows.test-helper.ts";

verifies("studio.workspace-workflow-arrow-fields", () => {
  const path = "hubs/acme/workflows/reply.workflow.yaml";
  const reply = { hubId: "acme", id: "reply" };
  const sortFile = [
    "id: reply",
    "name: Reply",
    "initial: sort",
    "states:",
    "  sort:",
    "    agent: sorter",
    "    on:",
    "      # Refunds need a person.",
    "      - to: approve",
    "        when: { equals: ['{{context.category}}', refund] }",
    "      - to: draft",
    "  approve:",
    "    type: wait",
    "    on:",
    "      - to: draft",
    "        event: approved",
    "      - to: done",
    "        after: 2d",
    "  draft:",
    "    on:",
    "      - to: done",
    "  done:",
    "    type: final",
    "",
  ].join("\n");

  const arrowsOf = async (host: ReturnType<typeof setup>["host"], from: string) =>
    (await host.read(reply)).arrows.filter((arrow) => arrow.from === from);

  it("sets an arrow's target, event, condition and label, each as one change that keeps comments", async () => {
    const { host, store, changes } = setup();
    store[path] = sortFile;

    await host.changeArrows(reply, "sort", { kind: "set", index: 1, field: "to", value: "done" });
    await host.changeArrows(reply, "sort", {
      kind: "set",
      index: 1,
      field: "event",
      value: "skipped",
    });
    await host.changeArrows(reply, "sort", {
      kind: "set",
      index: 1,
      field: "condition",
      value: { exists: "context.summary" },
    });
    await host.changeArrows(reply, "sort", {
      kind: "set",
      index: 1,
      field: "label",
      value: "Nothing to reply",
    });

    expect(changes).toHaveLength(4);
    expect(changes[0]?.label).toBe("Changed an arrow of step sort in workflow Reply");
    expect(store[path]).toContain("      # Refunds need a person.\n");
    expect((await arrowsOf(host, "sort"))[1]).toEqual({
      from: "sort",
      to: "done",
      event: "skipped",
      after: undefined,
      condition: { exists: "context.summary" },
      label: "Nothing to reply",
    });
  });

  it("takes a field out for none, and the done event out as the format's default", async () => {
    const { host, store } = setup();
    store[path] = sortFile;

    await host.changeArrows(reply, "sort", {
      kind: "set",
      index: 0,
      field: "condition",
      value: undefined,
    });
    await host.changeArrows(reply, "approve", {
      kind: "set",
      index: 0,
      field: "event",
      value: "done",
    });

    expect((await arrowsOf(host, "sort"))[0]?.condition).toBeUndefined();
    expect((await arrowsOf(host, "approve"))[0]?.event).toBeUndefined();
    expect(store[path]).not.toContain("when:");
    expect(store[path]).not.toContain("event:");
  });

  it("gives a wait step's arrow a timer in place of its event", async () => {
    const { host, store } = setup();
    store[path] = sortFile;

    await host.changeArrows(reply, "approve", {
      kind: "set",
      index: 0,
      field: "after",
      value: "4h",
    });

    expect((await arrowsOf(host, "approve"))[0]).toMatchObject({
      to: "draft",
      event: undefined,
      after: "4h",
    });
    expect(store[path]).not.toContain("event: approved");
  });

  it("refuses, and writes nothing, a value the format doesn't take, saying why", async () => {
    const { host, store, changes } = setup();
    store[path] = sortFile;

    await expect(
      host.changeArrows(reply, "approve", { kind: "set", index: 1, field: "after", value: "soon" }),
    ).rejects.toMatchObject({ kind: "invalid_input", message: expect.stringMatching(/^U.*\.$/) });
    await expect(
      host.changeArrows(reply, "sort", {
        kind: "set",
        index: 0,
        field: "condition",
        value: { maybe: true },
      }),
    ).rejects.toMatchObject({ kind: "invalid_input" });
    await expect(
      host.changeArrows(reply, "sort", { kind: "set", index: 0, field: "to", value: "gone" }),
    ).rejects.toMatchObject({ kind: "invalid_input" });
    await expect(
      host.changeArrows(reply, "sort", { kind: "set", index: 2, field: "label", value: "x" }),
    ).rejects.toMatchObject({ kind: "invalid_input" });
    expect(changes).toEqual([]);
    expect(store[path]).toBe(sortFile);
  });
});
