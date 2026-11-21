import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { setup } from "./workspace-agents.test-helper.ts";

const writer = { hubId: "acme", id: "writer" };

verifies("studio.workspace-agents-map", () => {
  it("answers the routines that start the agent, from its hub and the root", async () => {
    const { host, store } = setup();
    store["hubs/acme/workflows/routines/morning.routine.yaml"] =
      "name: Morning sort\ntrigger:\n  manual: true\nrun:\n  agent: writer\n  prompt: Sort it.\n";
    store["hubs/acme/workflows/routines/digest.routine.yaml"] =
      "name: Digest\ntrigger:\n  manual: true\nrun:\n  workflow: reply\n  input: {}\n";
    store["hubs/beta/workflows/routines/other.routine.yaml"] =
      "name: Other\ntrigger:\n  manual: true\nrun:\n  agent: writer\n  prompt: Not ours.\n";
    store["workflows/routines/nightly.routine.yaml"] =
      "name: Nightly\ntrigger:\n  manual: true\nrun:\n  hub: acme\n  agent: writer\n  prompt: Tidy.\n";
    const routines = await host.routinesOf(writer);
    expect(routines).toHaveLength(2);
    expect(routines).toEqual(
      expect.arrayContaining([
        { hubId: "acme", id: "morning", name: "Morning sort" },
        { hubId: null, id: "nightly", name: "Nightly" },
      ]),
    );
    await expect(host.routinesOf({ hubId: "acme", id: "gone" })).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("counts a connector's tools that ask first, among those agents can see", async () => {
    const { host, store } = setup();
    const connector = (id: string, tools: string) =>
      `version: 1\nid: ${id}\nname: ${id}\ntransport: { http: { url: https://${id}.example/mcp } }\ntools: ${tools}\n`;
    store["hubs/acme/library/connectors/one.connector.yaml"] = connector(
      "one",
      "{ approve: [send_mail] }",
    );
    store["hubs/acme/library/connectors/every.connector.yaml"] = connector(
      "every",
      "{ approve: all }",
    );
    store["hubs/acme/library/connectors/calm.connector.yaml"] = connector("calm", "{}");
    store["hubs/acme/library/connectors/hidden.connector.yaml"] = connector(
      "hidden",
      "{ approve: [send_mail, drop_mail], allow: [send_mail, read_mail] }",
    );
    const { connectors } = await host.toolOptions(writer);
    const byId = Object.fromEntries(connectors.map((each) => [each.id, each.asksFirst]));
    expect(byId).toEqual({ one: 1, every: "all", calm: undefined, hidden: 1 });
    expect(connectors.find((each) => each.id === "calm")).toEqual({ id: "calm", name: "calm" });
  });
});
