import { IntegrationRefusedError } from "@halonicjs/adapter-integration-kit/integration";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { bridged, untilAborted } from "./bridged.test-helper.ts";
import { fakeKitClient } from "./pipes.test-helper.ts";

verifies("integration-runner.requests", () => {
  describe("what Halonic refuses", () => {
    it("refuses a request a timer sends after its call has answered (A37)", async () => {
      const kit = fakeKitClient(() => new Response("ok"));
      let late: Promise<Response> | undefined;
      const { connection, finish } = await bridged(async (host) => {
        late = new Promise((resolve) => setTimeout(resolve, 20)).then(() =>
          host.http.fetch("https://api.example.com/v1/beacon"),
        );
        late.catch(() => undefined);
        return "done";
      }, kit);

      expect(await connection.callTool("run", {})).toBe("done");
      await expect(late).rejects.toThrow(
        "a request can only be sent while its tool call is running",
      );
      expect(kit.sent).toEqual([]);
      await finish();
    });

    it("refuses a request over 8 in flight (A21)", async () => {
      const kit = fakeKitClient(untilAborted);
      const { run } = await bridged(async (host) => {
        const requests = Array.from({ length: 9 }, (_, index) =>
          host.http.fetch(`https://api.example.com/v1/item/${index}`),
        );
        for (const request of requests) request.catch(() => undefined);
        try {
          await requests[8];
          return "ninth answered";
        } catch (error) {
          return (error as Error).message;
        }
      }, kit);

      expect(await run()).toBe("at most 8 requests can be in flight at once");
      expect(kit.sent).toHaveLength(8);
    });

    it("reports a kit refusal on the leak list, and gives the integration the kit's error", async () => {
      const kit = fakeKitClient(() => {
        throw new IntegrationRefusedError(
          "secret-in-request",
          "example: a secret is in the request",
        );
      });
      const { run, options } = await bridged(async (host) => {
        try {
          await host.http.fetch("https://api.example.com/v1/carry");
          return "sent";
        } catch (error) {
          return `${(error as Error).name} ${(error as IntegrationRefusedError).code}`;
        }
      }, kit);

      expect(await run()).toBe("IntegrationRefusedError secret-in-request");
      expect(options.blocks).toEqual([{ kind: "leak-attempt", code: "secret-in-request" }]);
    });

    it("doesn't report a refusal that isn't on the leak list", async () => {
      const kit = fakeKitClient(() => {
        throw new IntegrationRefusedError(
          "host-not-allowed",
          "example: shop.example.net is not allowed",
        );
      });
      const { run, options } = await bridged(async (host) => {
        try {
          await host.http.fetch("https://shop.example.net/");
          return "sent";
        } catch (error) {
          return (error as IntegrationRefusedError).code;
        }
      }, kit);

      expect(await run()).toBe("host-not-allowed");
      expect(options.blocks).toEqual([]);
    });

    it("reduces any other failure of the kit to a fixed message", async () => {
      const kit = fakeKitClient(() => {
        throw new TypeError("connect ECONNREFUSED 10.0.0.5:443");
      });
      const { run } = await bridged(async (host) => {
        try {
          await host.http.fetch("https://api.example.com/");
          return "sent";
        } catch (error) {
          return `${(error as Error).name}: ${(error as Error).message}`;
        }
      }, kit);

      expect(await run()).toBe("TypeError: the request failed");
    });
  });
});
