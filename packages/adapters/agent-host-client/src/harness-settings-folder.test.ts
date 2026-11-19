import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { agentHostHarnesses } from "./harness.ts";

/** An invented workspace and the agent folder the host would give for it. */
const workspace = "/data/acme";
const settingsFolder = "/data/profile/workspaces/k1/harness-settings/writer/claude-code";

const options = { bridgeIdOf: () => undefined, environments: {} };
const route = "POST /v1/harnesses/settings-folder";

async function claudeCode(host: FakeHost) {
  host.answer("GET /v1/harnesses", ok([{ id: "claude-code", name: "Claude Code" }]));
  const [harness] = await agentHostHarnesses(host, options);
  if (harness === undefined) throw new Error("no harness");
  return harness;
}

verifies("agent-host-client.harness-settings-folder", () => {
  describe("settingsFolderOf", () => {
    it("asks the host for the agent's own folder for this harness", async () => {
      const host = new FakeHost().answer(route, ok({ settingsFolder }));
      const harness = await claudeCode(host);
      expect(await harness.settingsFolderOf(workspace, "writer")).toBe(settingsFolder);
      expect(host.calls).toContainEqual({
        route,
        body: { workspace, agentId: "writer", harness: "claude-code" },
      });
    });

    it("fails with the host's kind for a workspace it doesn't serve", async () => {
      const host = new FakeHost().answer(
        route,
        refused(404, "unknown_workspace", "The agent host was not told to serve this workspace."),
      );
      const harness = await claudeCode(host);
      await expect(harness.settingsFolderOf(workspace, "writer")).rejects.toMatchObject({
        kind: "unknown_workspace",
      });
    });

    it("refuses an answer of another shape", async () => {
      const host = new FakeHost().answer(route, ok({ folder: settingsFolder }));
      const harness = await claudeCode(host);
      await expect(harness.settingsFolderOf(workspace, "writer")).rejects.toMatchObject({
        kind: "answer_invalid",
      });
    });
  });
});
