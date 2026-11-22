import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { setup } from "./workspace-agents.test-helper.ts";

verifies("studio.workspace-agents", () => {
  it("keeps both of two edits made close together, each on the file the one before left", async () => {
    const { host, store, changes } = setup();
    const ref = { hubId: "acme", id: "writer" };

    await Promise.all([
      host.update(ref, { name: "Reply writer" }),
      host.update(ref, { instructions: "Be brief." }),
    ]);

    expect(await host.settings(ref)).toMatchObject({
      name: "Reply writer",
      instructions: "Be brief.",
    });
    expect(store["hubs/acme/agents/writer.agent.yaml"]).toContain("name: Reply writer");
    expect(changes).toHaveLength(2);
  });

  it("still makes the next edit when one before it was refused", async () => {
    const { host } = setup();
    const ref = { hubId: "acme", id: "writer" };

    const [refused, made] = await Promise.allSettled([
      host.update(ref, { name: "" }),
      host.update(ref, { instructions: "Be brief." }),
    ]);

    expect(refused.status).toBe("rejected");
    expect(made.status).toBe("fulfilled");
    expect(await host.settings(ref)).toMatchObject({ instructions: "Be brief." });
  });
});
