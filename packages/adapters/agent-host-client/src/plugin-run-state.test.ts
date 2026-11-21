import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostPluginRunStates } from "./plugin-run-state.ts";

const readRoute = "POST /v1/plugins/run-state";
const againRoute = "POST /v1/plugins/run-state/check-again";
const stoppedAt = "2026-11-21T18:00:00.000Z";

verifies("agent-host-client.plugin-run-state", () => {
  describe("runState", () => {
    it("asks the host with the plugin's id only, and answers a stop with its time", async () => {
      const host = new FakeHost().answer(readRoute, ok({ stopped: true, stoppedAt }));

      const state = await new AgentHostPluginRunStates(host).runState("weather");

      expect(state).toEqual({ stopped: true, stoppedAt });
      expect(host.calls).toEqual([{ route: readRoute, body: { plugin: "weather" } }]);
    });

    it("answers not stopped", async () => {
      const host = new FakeHost().answer(readRoute, ok({ stopped: false }));

      expect(await new AgentHostPluginRunStates(host).runState("weather")).toEqual({
        stopped: false,
      });
    });

    it("fails with answer_invalid for an extra field, a stop without its time or a time on no stop", async () => {
      for (const body of [
        { stopped: true, stoppedAt, path: "/profile/plugins/weather" },
        { stopped: true },
        { stopped: false, stoppedAt },
        { stopped: "yes" },
      ]) {
        const host = new FakeHost().answer(readRoute, ok(body));
        await expect(new AgentHostPluginRunStates(host).runState("weather")).rejects.toMatchObject({
          kind: "answer_invalid",
        });
      }
    });

    it("fails with the host's kind when it refuses", async () => {
      const host = new FakeHost().answer(readRoute, refused(401, "unauthorized", "x"));

      await expect(new AgentHostPluginRunStates(host).runState("weather")).rejects.toMatchObject({
        status: 401,
        kind: "unauthorized",
      });
    });
  });

  describe("checkAgain", () => {
    it("asks the host to forget the stop, with the plugin's id only", async () => {
      const host = new FakeHost().answer(againRoute, ok({ stopped: false }));

      expect(await new AgentHostPluginRunStates(host).checkAgain("weather")).toEqual({
        stopped: false,
      });
      expect(host.calls).toEqual([{ route: againRoute, body: { plugin: "weather" } }]);
    });
  });
});
