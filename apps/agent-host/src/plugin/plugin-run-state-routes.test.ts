import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { pluginRunStateRoutes } from "./plugin-run-state-routes.ts";
import { maxStoppedPlugins, PluginRunStates } from "./plugin-run-states.ts";

const token = randomLaunchToken();
const stoppedAt = "2026-11-21T18:00:00.000Z";
const clock = { now: () => new Date(stoppedAt) };

let server: HostServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function setup() {
  const states = new PluginRunStates(clock);
  server = await startHostServer(token, pluginRunStateRoutes(states));
  const url = server.url;
  const post = async (path: string, body: unknown, headers = auth()) =>
    await fetch(`${url}${path}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  return { states, post };
}

function auth(value = `Bearer ${token}`): Record<string, string> {
  return { authorization: value };
}

verifies("agent-host.plugin-run-state", () => {
  describe("PluginRunStates", () => {
    it("keeps a plugin whose start stopped (A23) until a start that runs", () => {
      const states = new PluginRunStates(clock);
      expect(states.stateOf("weather")).toEqual({ stopped: false });
      states.started("weather", "stopped");
      expect(states.stateOf("weather")).toEqual({ stopped: true, stoppedAt });
      states.started("weather", "needs-yes");
      expect(states.stateOf("weather")).toEqual({ stopped: true, stoppedAt });
      states.started("weather", "fenced");
      expect(states.stateOf("weather")).toEqual({ stopped: false });
      states.started("weather", "stopped");
      states.started("weather", "unfenced");
      expect(states.stateOf("weather")).toEqual({ stopped: false });
    });

    it("keeps each plugin apart, and forgets one on Check again", () => {
      const states = new PluginRunStates(clock);
      states.started("weather", "stopped");
      states.started("tides", "stopped");
      states.forget("weather");
      expect(states.stateOf("weather")).toEqual({ stopped: false });
      expect(states.stateOf("tides")).toEqual({ stopped: true, stoppedAt });
    });

    it("keeps at most a bounded number of stops, dropping the oldest", () => {
      const states = new PluginRunStates(clock);
      for (let index = 0; index <= maxStoppedPlugins; index += 1) {
        states.started(`plugin-${index}`, "stopped");
      }
      expect(states.stateOf("plugin-0")).toEqual({ stopped: false });
      expect(states.stateOf(`plugin-${maxStoppedPlugins}`).stopped).toBe(true);
    });
  });

  describe("the run-state routes", () => {
    it("answers a stopped plugin with its time, and any other id as not stopped", async () => {
      const { states, post } = await setup();
      states.started("weather", "stopped");
      const stopped = await post("/v1/plugins/run-state", { plugin: "weather" });
      expect(stopped.status).toBe(200);
      expect(await stopped.json()).toEqual({ stopped: true, stoppedAt });
      const other = await post("/v1/plugins/run-state", { plugin: "not-installed" });
      expect(await other.json()).toEqual({ stopped: false });
    });

    it("forgets the stop on Check again, for that plugin only", async () => {
      const { states, post } = await setup();
      states.started("weather", "stopped");
      states.started("tides", "stopped");
      const again = await post("/v1/plugins/run-state/check-again", { plugin: "weather" });
      expect(again.status).toBe(200);
      expect(await again.json()).toEqual({ stopped: false });
      expect(states.stateOf("tides").stopped).toBe(true);
    });

    it("answers 401 without the launch token or with a wrong one, and forgets nothing", async () => {
      const { states, post } = await setup();
      states.started("weather", "stopped");
      for (const headers of [{}, auth("Bearer wrong"), auth(token)]) {
        for (const path of ["/v1/plugins/run-state", "/v1/plugins/run-state/check-again"]) {
          const refused = await post(path, { plugin: "weather" }, headers);
          expect(refused.status).toBe(401);
          expect(await refused.text()).not.toContain(stoppedAt);
        }
      }
      expect(states.stateOf("weather").stopped).toBe(true);
    });

    it("answers 400 for a path, a device name, a missing id or an extra field, and forgets nothing", async () => {
      const { states, post } = await setup();
      states.started("weather", "stopped");
      for (const body of [
        { plugin: "../weather" },
        { plugin: "con" },
        { plugin: "Weather" },
        {},
        { plugin: "weather", reason: "container" },
        "weather",
      ]) {
        for (const path of ["/v1/plugins/run-state", "/v1/plugins/run-state/check-again"]) {
          const refused = await post(path, body);
          expect(refused.status).toBe(400);
          expect(await refused.text()).toContain("body_invalid");
        }
      }
      expect(states.stateOf("weather").stopped).toBe(true);
    });

    it("answers codes only: nothing but `stopped` and `stoppedAt`", async () => {
      const { states, post } = await setup();
      states.started("weather", "stopped");
      const answer = (await (
        await post("/v1/plugins/run-state", { plugin: "weather" })
      ).json()) as Record<string, unknown>;
      expect(Object.keys(answer).sort()).toEqual(["stopped", "stoppedAt"]);
    });
  });
});
