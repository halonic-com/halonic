import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostPaperclipKey } from "./paperclip-key.ts";

verifies("agent-host-client.paperclip-key", () => {
  describe("disconnect", () => {
    const disconnect = "POST /v1/paperclip/disconnect";
    const ref = { workspace: "/work/acme", connection: "halonic" };

    it("asks the host with the workspace and the connection, and says whether the key was revoked", async () => {
      const host = new FakeHost().answer(disconnect, ok({ revoked: false }));

      const result = await new AgentHostPaperclipKey(host).disconnect({
        ...ref,
        extra: "x",
      } as typeof ref);

      expect(result).toEqual({ revoked: false });
      expect(host.calls).toEqual([{ route: disconnect, body: ref }]);
    });

    it("fails with the host's kind when it refuses", async () => {
      const host = new FakeHost().answer(disconnect, refused(404, "unknown_workspace", "x"));

      await expect(new AgentHostPaperclipKey(host).disconnect(ref)).rejects.toMatchObject({
        status: 404,
        kind: "unknown_workspace",
      });
    });
  });
});
