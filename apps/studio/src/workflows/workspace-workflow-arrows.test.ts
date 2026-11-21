import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { setup } from "./workspace-workflows.test-helper.ts";

verifies("studio.workspace-workflow-arrows", () => {
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

  it("gives each arrow's event, timer and condition, leaving out the done event", async () => {
    const { host, store } = setup();
    store[path] = sortFile;

    const { arrows } = await host.read(reply);

    expect(arrows.slice(0, 4)).toEqual([
      {
        from: "sort",
        to: "approve",
        label: undefined,
        event: undefined,
        after: undefined,
        condition: { equals: ["{{context.category}}", "refund"] },
      },
      expect.objectContaining({
        from: "sort",
        to: "draft",
        event: undefined,
        condition: undefined,
      }),
      expect.objectContaining({ from: "approve", to: "draft", event: "approved" }),
      expect.objectContaining({ from: "approve", to: "done", after: "2d" }),
    ]);
  });

  it("adds an arrow on done after the step's others, as one change that keeps comments", async () => {
    const { host, store, changes } = setup();
    store[path] = sortFile;

    await host.changeArrows(reply, "sort", { kind: "add", to: "done" });

    expect(changes).toHaveLength(1);
    expect(store[path]).toContain("      # Refunds need a person.\n");
    const sortArrows = (await host.read(reply)).arrows.filter((arrow) => arrow.from === "sort");
    expect(sortArrows.map((arrow) => arrow.to)).toEqual(["approve", "draft", "done"]);
    expect(store[path]).not.toContain("event: done");
  });

  it("adds the first arrow of a step that has no `on` list", async () => {
    const { host, store } = setup();
    store[path] = sortFile.replace(
      "  done:\n    type: final\n",
      "  done:\n    type: final\n  extra: {}\n",
    );

    await host.changeArrows(reply, "extra", { kind: "add", to: "done" });

    const { arrows } = await host.read(reply);
    expect(arrows.filter((arrow) => arrow.from === "extra")).toEqual([
      expect.objectContaining({ to: "done" }),
    ]);
  });

  it("moves an arrow one place up or down, keeping the keys its file gives it", async () => {
    const { host, store, changes } = setup();
    store[path] = sortFile;

    await host.changeArrows(reply, "sort", { kind: "move", index: 0, by: 1, to: "approve" });
    let sortArrows = (await host.read(reply)).arrows.filter((arrow) => arrow.from === "sort");
    expect(sortArrows.map((arrow) => arrow.to)).toEqual(["draft", "approve"]);
    expect(sortArrows[1]?.condition).toEqual({ equals: ["{{context.category}}", "refund"] });

    await host.changeArrows(reply, "sort", { kind: "move", index: 1, by: -1, to: "approve" });
    sortArrows = (await host.read(reply)).arrows.filter((arrow) => arrow.from === "sort");
    expect(sortArrows.map((arrow) => arrow.to)).toEqual(["approve", "draft"]);
    expect(changes).toHaveLength(2);
    expect(store[path]).not.toContain("event: done");
  });

  it("refuses a step or a target that isn't there, an end step and a move off the list, writing nothing", async () => {
    const { host, store, changes } = setup();
    store[path] = sortFile;

    await expect(
      host.changeArrows(reply, "gone", { kind: "add", to: "done" }),
    ).rejects.toMatchObject({ kind: "not_found" });
    await expect(
      host.changeArrows(reply, "sort", { kind: "add", to: "gone" }),
    ).rejects.toMatchObject({ kind: "invalid_input" });
    await expect(
      host.changeArrows(reply, "done", { kind: "add", to: "sort" }),
    ).rejects.toMatchObject({
      kind: "invalid_input",
      message: expect.stringContaining("no arrows"),
    });
    for (const move of [
      { index: 0, by: -1, to: "approve" },
      { index: 1, by: 1, to: "draft" },
      { index: 2, by: -1, to: "draft" },
    ] as const) {
      await expect(
        host.changeArrows(reply, "sort", { kind: "move", ...move }),
      ).rejects.toMatchObject({ kind: "invalid_input" });
    }
    expect(changes).toEqual([]);
  });

  it("refuses a move of an arrow that no longer goes where the card showed it", async () => {
    const { host, store, changes } = setup();
    store[path] = sortFile;

    // The card still shows `draft` second, but the file has it first by now.
    await expect(
      host.changeArrows(reply, "sort", { kind: "move", index: 1, by: -1, to: "draft" }),
    ).resolves.toBeUndefined();
    await expect(
      host.changeArrows(reply, "sort", { kind: "move", index: 1, by: -1, to: "draft" }),
    ).rejects.toMatchObject({ kind: "invalid_input", message: expect.stringContaining("changed") });
    expect(changes).toHaveLength(1);
  });
});
