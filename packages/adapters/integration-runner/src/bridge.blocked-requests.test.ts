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
import type { HttpClient, IntegrationHttpClient } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { bridged } from "./bridged.test-helper.ts";
import { fakeKitClient } from "./pipes.test-helper.ts";

/**
 * A sheet that lists one host and one secret. The kit reads every declared
 * secret before it checks the host, so a store that answers late holds the
 * refusal back.
 */
const policy: IntegrationPolicy = {
  name: "acme",
  hosts: ["api.example.com"],
  secrets: { "api-key": { hosts: ["api.example.com"], placement: { as: "bearer" } } },
  signIns: {},
  tokens: [],
};

/** A request the kit's client got, and how far it went. */
interface KitRequest {
  readonly signal: AbortSignal | null | undefined;
  /** Settles once the kit has answered or refused it. */
  settled?: Promise<void>;
}

/**
 * The kit's real client over a fake network that records every URL it is
 * asked for. With `holdSecrets`, the secret store answers only once the
 * bridge has aborted the request, so the kit refuses it after the abort.
 */
function realKit(answer: (url: string) => Response, { holdSecrets = false } = {}) {
  const network: string[] = [];
  const requests: KitRequest[] = [];
  const transport: HttpClient = {
    fetch: async (url) => {
      network.push(url);
      return answer(url);
    },
  };
  const limited = createLimitedHttpClient({
    policy,
    transport,
    secrets: {
      get: async () => {
        const signal = requests.at(-1)?.signal;
        if (holdSecrets && signal) await aborted(signal);
        return "example-key-for-the-fake-store";
      },
    },
    log: new RequestLog(),
  });
  const http: IntegrationHttpClient = {
    fetch: (url, init) => {
      // Recorded before the kit starts, because it asks the store for secrets at once.
      const request: KitRequest = { signal: init?.signal };
      requests.push(request);
      const response = limited.fetch(url, init);
      request.settled = response.then(ignore, ignore);
      return response;
    },
  };
  return { http, network, requests };
}

/** Waits until every request the kit got has been answered or refused, and the bridge has heard. */
async function allSettled(requests: readonly KitRequest[]): Promise<void> {
  await Promise.all(requests.map((request) => request.settled));
  // The bridge's own handler for the same answer runs after ours: give it its turn.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function aborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) =>
    signal.addEventListener("abort", () => resolve(), { once: true }),
  );
}

function ignore(): void {}

/** The code the integration gets when its request is refused, or "sent". */
async function codeOf(request: Promise<Response>): Promise<string> {
  try {
    await request;
    return "sent";
  } catch (error) {
    return error instanceof IntegrationRefusedError ? error.code : String(error);
  }
}

verifies("integration-runner.host-block", () => {
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

    it("reports the host when the integration doesn't await its request", async () => {
      const kit = realKit(() => new Response("ok"), { holdSecrets: true });
      const { run, options } = await bridged(async (host) => {
        host.http.fetch("https://undeclared.example.net/collect").catch(ignore);
        return "returned";
      }, kit.http);

      expect(await run()).toBe("returned");
      await allSettled(kit.requests);
      expect(options.blocks).toEqual([
        { kind: "host-not-declared", host: "undeclared.example.net" },
      ]);
      expect(kit.network).toEqual([]);
    });

    it("reports the host when the integration aborts its request at once", async () => {
      const kit = realKit(() => new Response("ok"), { holdSecrets: true });
      const { run, options } = await bridged(async (host) => {
        const controller = new AbortController();
        const request = host.http.fetch("https://undeclared.example.net/collect", {
          signal: controller.signal,
        });
        controller.abort();
        return codeOf(request);
      }, kit.http);

      await run();
      await allSettled(kit.requests);
      expect(kit.requests[0]?.signal?.aborted).toBe(true);
      expect(options.blocks).toEqual([
        { kind: "host-not-declared", host: "undeclared.example.net" },
      ]);
      expect(kit.network).toEqual([]);
    });

    it("reports a leak attempt when the integration doesn't await its request", async () => {
      let refuse = ignore;
      const refused = new Promise<void>((resolve) => {
        refuse = resolve;
      });
      const kit = fakeKitClient(async () => {
        await refused;
        throw new IntegrationRefusedError("secret-in-request", "acme: a secret is in the request");
      });
      const { run, options } = await bridged(async (host) => {
        host.http.fetch("https://api.example.com/v1/carry").catch(ignore);
        return "returned";
      }, kit);

      expect(await run()).toBe("returned");
      refuse();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(options.blocks).toEqual([{ kind: "leak-attempt", code: "secret-in-request" }]);
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
