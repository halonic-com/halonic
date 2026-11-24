import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostPluginTools } from "./plugin-tools.ts";

const route = "GET /v1/plugins/tools";

verifies("agent-host-client.plugin-tools", () => {
  describe("inThisBuild", () => {
    it("asks the host with no body and answers what it says", async () => {
      for (const inThisBuild of [true, false]) {
        const host = new FakeHost().answer(route, ok({ inThisBuild }));

        expect(await new AgentHostPluginTools(host).inThisBuild()).toBe(inThisBuild);
        expect(host.calls).toEqual([{ route, body: undefined }]);
      }
    });

    it("fails with answer_invalid for an extra field or a value that isn't a boolean", async () => {
      for (const body of [{ inThisBuild: false, reason: "sea" }, { inThisBuild: "no" }, {}]) {
        const host = new FakeHost().answer(route, ok(body));
        await expect(new AgentHostPluginTools(host).inThisBuild()).rejects.toMatchObject({
          kind: "answer_invalid",
        });
      }
    });

    it("fails with the host's kind when it refuses", async () => {
      const host = new FakeHost().answer(route, refused(401, "unauthorized", "x"));

      await expect(new AgentHostPluginTools(host).inThisBuild()).rejects.toMatchObject({
        status: 401,
        kind: "unauthorized",
      });
    });
  });
});
