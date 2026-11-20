import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { setup } from "./workspace-workflows.test-helper.ts";

verifies("studio.workspace-workflow-remove", () => {
  const path = "hubs/acme/workflows/reply.workflow.yaml";
  const reply = { hubId: "acme", id: "reply" };
  const sortFile = [
    "id: reply",
    "name: Reply",
    "initial: sort",
    "states:",
    "  sort:",
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
    "  draft:",
    "    on:",
    "      - to: done",
    "  done:",
    "    type: final",
    "layout:",
    "  draft: { x: 480, y: 0 }",
    "",
  ].join("\n");

  /** The workflow's arrows, as "from → to". */
  const arrowsNow = async (host: ReturnType<typeof setup>["host"]) =>
    (await host.read(reply)).arrows.map((arrow) => `${arrow.from} → ${arrow.to}`);

  it("removes a step with its place, its arrows and those into it, as one change", async () => {
    const { host, store, changes } = setup();
    store[path] = sortFile;

    const removed = await host.removeStep(reply, "draft");

    expect(removed.arrows).toBe(3);
    expect(changes.map((one) => one.label)).toEqual(["Removed step draft from workflow Reply"]);
    const view = await host.read(reply);
    expect(view.steps.map((step) => step.id)).toEqual(["sort", "approve", "done"]);
    expect(view.layout).toEqual({});
    expect(await arrowsNow(host)).toEqual(["sort → approve"]);
    // The comment above the arrow that stays is kept, and approve has no empty `on` list left.
    expect(store[path]).toContain("      # Refunds need a person.\n      - to: approve");
    expect(store[path]).not.toMatch(/approve:\n {4}type: wait\n {4}on:/);
  });

  it("puts the step back on undo while its removal is the newest change", async () => {
    const { host, store } = setup();
    store[path] = sortFile;

    const removed = await host.removeStep(reply, "draft");
    await removed.undo();

    expect(store[path]).toBe(sortFile);
  });

  it("refuses to undo after another change, and changes nothing", async () => {
    const { host, store } = setup();
    store[path] = sortFile;
    const removed = await host.removeStep(reply, "draft");
    await host.changeStep(reply, "sort", { description: "Sorts the mail." });
    const after = store[path];

    await expect(removed.undo()).rejects.toThrow(
      "Step draft can't be put back, because the workspace changed after it was removed.",
    );
    expect(store[path]).toBe(after);
  });

  it("refuses to remove the first step, a step that isn't there, and writes nothing", async () => {
    const { host, store, changes } = setup();
    store[path] = sortFile;

    const first = host.removeStep(reply, "sort");
    await expect(first).rejects.toThrow(
      "This is the first step. Pick another first step in Configuration › General before removing it.",
    );
    await expect(first).rejects.toSatisfy(
      (error) => error instanceof KindedError && error.kind === "conflict",
    );
    await expect(host.removeStep(reply, "gone")).rejects.toThrow('no step "gone"');
    expect(changes).toEqual([]);
  });

  it("removes one arrow and keeps the comments, as one change that undo puts back", async () => {
    const { host, store, changes } = setup();
    store[path] = sortFile;

    const removed = await host.removeArrow(reply, "sort", 1);

    expect(changes.map((one) => one.label)).toEqual([
      "Removed an arrow of step sort in workflow Reply",
    ]);
    expect(await arrowsNow(host)).toEqual(["sort → approve", "approve → draft", "draft → done"]);
    expect(store[path]).toContain("      # Refunds need a person.\n      - to: approve");
    await removed.undo();
    expect(store[path]).toBe(sortFile);
  });

  it("takes out a step's `on` list with its last arrow", async () => {
    const { host, store } = setup();
    store[path] = sortFile;

    await host.removeArrow(reply, "draft", 0);

    expect(store[path]).toContain("  draft: {}\n  done:");
  });

  it("refuses an arrow that isn't there, and writes nothing", async () => {
    const { host, store, changes } = setup();
    store[path] = sortFile;

    await expect(host.removeArrow(reply, "sort", 2)).rejects.toThrow("This arrow isn't there.");
    await expect(host.removeArrow(reply, "done", 0)).rejects.toThrow("This arrow isn't there.");
    expect(changes).toEqual([]);
  });
});
