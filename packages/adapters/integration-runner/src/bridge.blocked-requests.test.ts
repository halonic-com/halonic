// Which refused requests the bridge reports as blocked (HAL-19196). A host the
// integration's own code asked for is a block; a host a redirect named is
// not, because the service chose it. These run the kit's real client, so the
// refusal is the one the kit really throws.

import {
  createLimitedHttpClient,
  type IntegrationPolicy,
  leakAttemptCodes,
  RequestLog,
} from "@halonicjs/adapter-integration-kit";
import { IntegrationRefusedError } from "@halonicjs/adapter-integration-kit/integration";
import type { HttpClient } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { bridged } from "./bridged.test-helper.ts";
import { fakeKitClient } from "./pipes.test-helper.ts";

/** A sheet that lists one host and no secrets. */
const policy: IntegrationPolicy = {
  name: "acme",
  hosts: ["api.example.com"],
  secrets: {},
  signIns: {},
  tokens: [],
};

/** The kit's real client over a fake network that records every URL it is asked for. */
function realKit(answer: (url: string) => Response) {
  const network: string[] = [];
  const transport: HttpClient = {
    fetch: async (url) => {
      network.push(url);
      return answer(url);
    },
  };
  const http = createLimitedHttpClient({
    policy,
    transport,
    secrets: { get: async () => null },
    log: new RequestLog(),
  });
  return { http, network };
}

/** The code the integration gets when its request is refused, or "sent". */
async function codeOf(request: Promise<Response>): Promise<string> {
  try {
    await request;
    return "sent";
  } catch (error) {
    return error instanceof IntegrationRefusedError ? error.code : String(error);
  }
}

verifies("integration-runner.requests", () => {
  describe("a refused request reported as blocked", () => {
    it("reports a host the integration's own code asked for, and sends nothing", async () => {
      const kit = realKit(() => new Response("ok"));
      const { run, options } = await bridged(
        (host) => codeOf(host.http.fetch("https://undeclared.example.net/collect")),
        kit.http,
      );

      expect(await run()).toBe("host-not-allowed");
      expect(options.blocks).toEqual([
        { kind: "host-not-declared", host: "undeclared.example.net" },
      ]);
      expect(kit.network).toEqual([]);
    });

    it("doesn't report a redirect to an undeclared host, which the service chose", async () => {
      const kit = realKit(
        () =>
          new Response(null, {
            status: 302,
            headers: { location: "https://undeclared.example.net/elsewhere" },
          }),
      );
      const { run, options } = await bridged(
        (host) => codeOf(host.http.fetch("https://api.example.com/v1/forecast")),
        kit.http,
      );

      expect(await run()).toBe("host-not-allowed");
      expect(options.blocks).toEqual([]);
      expect(kit.network).toEqual(["https://api.example.com/v1/forecast"]);
    });

    it.each(leakAttemptCodes)("reports %s as a leak attempt, as before", async (code) => {
      const kit = fakeKitClient(() => {
        throw new IntegrationRefusedError(code, `acme: refused as ${code}`);
      });
      const { run, options } = await bridged(
        (host) => codeOf(host.http.fetch("https://api.example.com/v1/carry")),
        kit,
      );

      expect(await run()).toBe(code);
      expect(options.blocks).toEqual([{ kind: "leak-attempt", code }]);
    });

    it("keeps exactly the three leak codes", () => {
      expect(leakAttemptCodes).toEqual([
        "secret-in-request",
        "placement-not-in-sheet",
        "secret-sign-in-only",
      ]);
    });
  });
});
