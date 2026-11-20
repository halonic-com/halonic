import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostPluginSecrets } from "./plugin-secrets.ts";

const route = "POST /v1/plugins/secrets";
// A fake value only these tests use, so its absence from messages means something.
const fakeValue = "fake-acme-key-for-tests-only";

verifies("agent-host-client.plugin-secrets", () => {
  describe("handOver", () => {
    it("asks the host with the plugin and its secrets by their declared names, and answers the count", async () => {
      const host = new FakeHost().answer(route, ok({ kept: 1 }));

      const kept = await new AgentHostPluginSecrets(host).handOver("acme-notes", {
        "acme-key": fakeValue,
      });

      expect(kept).toBe(1);
      expect(host.calls).toEqual([
        { route, body: { plugin: "acme-notes", secrets: { "acme-key": fakeValue } } },
      ]);
    });

    it("says plainly that the plugin doesn't declare a secret, and names no value", async () => {
      const host = new FakeHost().answer(route, refused(400, "secret_not_declared", "x"));

      const failure = new AgentHostPluginSecrets(host).handOver("acme-notes", {
        "other-key": fakeValue,
      });

      await expect(failure).rejects.toMatchObject({
        status: 400,
        kind: "secret_not_declared",
        message: expect.stringContaining("doesn't declare"),
      });
      await expect(failure).rejects.not.toMatchObject({
        message: expect.stringContaining(fakeValue),
      });
    });

    it("fails with the host's kind and the plain words of a call when the trust doesn't cover the plugin", async () => {
      const host = new FakeHost().answer(route, refused(403, "plugin_not_trusted", "x"));

      await expect(
        new AgentHostPluginSecrets(host).handOver("acme-notes", {}),
      ).rejects.toMatchObject({
        status: 403,
        kind: "plugin_not_trusted",
        message: expect.stringContaining("Review it and trust it first"),
      });
    });

    it("fails with answer_invalid for an answer that isn't a hand-over's", async () => {
      const host = new FakeHost().answer(route, ok({ text: "done" }));

      await expect(
        new AgentHostPluginSecrets(host).handOver("acme-notes", {}),
      ).rejects.toMatchObject({ kind: "answer_invalid" });
    });
  });
});
