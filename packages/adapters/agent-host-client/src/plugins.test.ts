import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostPluginToolCaller } from "./plugins.ts";

const route = "POST /v1/plugins/call";

verifies("agent-host-client.plugins", () => {
  describe("call", () => {
    it("asks the host with the plugin, the tool and the arguments, and answers the text", async () => {
      const host = new FakeHost().answer(route, ok({ text: "done" }));

      const text = await new AgentHostPluginToolCaller(host).call("acme-notes", "add", { n: 1 });

      expect(text).toBe("done");
      expect(host.calls).toEqual([
        { route, body: { plugin: "acme-notes", tool: "add", args: { n: 1 } } },
      ]);
    });

    it("says plainly that nothing runs where no sandbox fences a plugin", async () => {
      const host = new FakeHost().answer(route, refused(403, "not_fenced", "host's own text"));

      await expect(
        new AgentHostPluginToolCaller(host).call("acme-notes", "add", {}),
      ).rejects.toMatchObject({
        status: 403,
        kind: "not_fenced",
        message: expect.stringContaining("Nothing was started"),
      });
    });

    it("fails with the host's kind when the trust doesn't cover the plugin", async () => {
      const host = new FakeHost().answer(route, refused(403, "plugin_not_trusted", "x"));

      await expect(
        new AgentHostPluginToolCaller(host).call("acme-notes", "add", {}),
      ).rejects.toMatchObject({ status: 403, kind: "plugin_not_trusted" });
    });

    it("keeps the host's message for a kind it doesn't know", async () => {
      const host = new FakeHost().answer(route, refused(400, "bad_request", "The body is wrong."));

      await expect(
        new AgentHostPluginToolCaller(host).call("acme-notes", "add", {}),
      ).rejects.toMatchObject({ kind: "bad_request", message: "The body is wrong." });
    });

    it("fails with answer_invalid for an answer that isn't a tool's", async () => {
      const host = new FakeHost().answer(route, ok({ result: 1 }));

      await expect(
        new AgentHostPluginToolCaller(host).call("acme-notes", "add", {}),
      ).rejects.toMatchObject({ kind: "answer_invalid" });
    });
  });
});
