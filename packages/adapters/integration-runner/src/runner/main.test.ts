import type { Integration } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { connectRunner } from "../halonic/connect-runner.ts";
import { bridgeOptions, fakeRunnerProcess, testNonce } from "../pipes.test-helper.ts";
import { runRunner } from "./main.ts";

const weather: Integration = {
  name: "weather",
  version: "1.0.0",
  tools: [],
  connect: (host) => ({
    callTool: async (name) => `${name} in ${String(host.settings["baseUrl"])}`,
    close: async () => undefined,
  }),
};

verifies("integration-runner.start", () => {
  describe("runRunner", () => {
    it("loads the named export from the entry file once start has arrived, and serves it", async () => {
      const fake = fakeRunnerProcess();
      const imported: string[] = [];
      const running = runRunner(
        [testNonce, "/work/weather", "/work/weather/index.js", "weather"],
        { input: fake.runnerInput, output: fake.runnerOutput },
        async (url) => {
          imported.push(url);
          return { weather };
        },
      );
      const connection = await connectRunner(bridgeOptions(fake));
      expect(connection.declaration).toEqual({ name: "weather", version: "1.0.0", tools: [] });
      expect(await connection.callTool("forecast", {})).toBe("forecast in https://api.example.com");
      expect(imported).toEqual(["file:///work/weather/index.js"]);
      await connection.close();
      await running;
    });

    it("fails when the module has no integration under that name", async () => {
      const fake = fakeRunnerProcess();
      const running = runRunner(
        [testNonce, "/work/weather", "/work/weather/index.js", "forecast"],
        { input: fake.runnerInput, output: fake.runnerOutput },
        async () => ({ weather, forecast: "not an integration" }),
      );
      const connecting = connectRunner(bridgeOptions(fake));
      await expect(running).rejects.toThrow(/no integration named "forecast"/);
      fake.exit(1);
      await expect(connecting).rejects.toMatchObject({
        stop: { reason: "exited", exit: { code: 1 } },
      });
    });

    it("gives the integration a token store that holds nothing", async () => {
      const fake = fakeRunnerProcess();
      const asksForAToken: Integration = {
        ...weather,
        connect: (host) => ({
          callTool: async () => (await host.tokens.get("access")) ?? "no token",
          close: async () => undefined,
        }),
      };
      const running = runRunner(
        [testNonce, "/work/weather", "/work/weather/index.js", "weather"],
        { input: fake.runnerInput, output: fake.runnerOutput },
        async () => ({ weather: asksForAToken }),
      );
      const connection = await connectRunner(bridgeOptions(fake));
      await expect(connection.callTool("forecast", {})).rejects.toThrow(
        /can't hold sign-in secrets/,
      );
      await connection.close();
      await running;
    });

    it("fails before saying ready when its arguments are wrong", async () => {
      const fake = fakeRunnerProcess();
      await expect(
        runRunner([testNonce], { input: fake.runnerInput, output: fake.runnerOutput }),
      ).rejects.toThrow(/four arguments/);
    });
  });
});
