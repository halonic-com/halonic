import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { replyFile, setup } from "./workspace-workflows.test-helper.ts";

verifies("studio.workspace-workflow-rename", () => {
  it("changes only the name in the file, as one change, and keeps the id, the path and the comments", async () => {
    const { host, store, changes } = setup();
    const path = "hubs/acme/workflows/reply.workflow.yaml";
    store[path] = `# Answers the support mail.\n${replyFile}`;

    await host.rename({ hubId: "acme", id: "reply" }, "  Mail triage ");

    expect(changes).toHaveLength(1);
    expect(Object.keys(changes[0]?.changes ?? {})).toEqual([path]);
    expect(store[path]).toBe(
      "# Answers the support mail.\nid: reply\nname: Mail triage\ninitial: first\nstates:\n  first:\n    type: final\n",
    );
    expect(host.nameOf({ hubId: "acme", id: "reply" })).toBe("Mail triage");
    expect((await host.read({ hubId: "acme", id: "reply" })).name).toBe("Mail triage");
  });

  it("refuses a name another workflow of the hub has, whatever its case, and writes nothing", async () => {
    const { host, store, changes } = setup();
    store["hubs/acme/workflows/triage.workflow.yaml"] = replyFile
      .replace("id: reply", "id: triage")
      .replace("name: Reply", "name: Mail triage");

    await expect(host.rename({ hubId: "acme", id: "reply" }, "mail TRIAGE")).rejects.toMatchObject({
      kind: "conflict",
      message: "A workflow called Mail triage already exists.",
    });
    expect(changes).toEqual([]);
  });

  it("allows a name a workflow of another hub has", async () => {
    const { host, store } = setup();
    store["hubs/beta/workflows/triage.workflow.yaml"] = replyFile
      .replace("id: reply", "id: triage")
      .replace("name: Reply", "name: Mail triage");

    await host.rename({ hubId: "acme", id: "reply" }, "Mail triage");

    expect(store["hubs/acme/workflows/reply.workflow.yaml"]).toContain("name: Mail triage");
  });

  it("refuses an empty name and a workflow the hub doesn't have, and writes nothing", async () => {
    const { host, changes } = setup();

    await expect(host.rename({ hubId: "acme", id: "reply" }, "  ")).rejects.toMatchObject({
      kind: "invalid_input",
    });
    await expect(host.rename({ hubId: "acme", id: "gone" }, "Gone")).rejects.toMatchObject({
      kind: "not_found",
    });
    expect(changes).toEqual([]);
  });
});
