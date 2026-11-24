import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { outboundGate, siteAllowed } from "./outbound-gate.ts";

const gate = outboundGate(
  { bridgeHost: "bridge.halonic.invalid", allowedSites: ["*.example.com", "registry.npmjs.org"] },
  {
    bridge: () => Promise.resolve(new Response("bridge")),
    site: () => Promise.resolve(new Response("site")),
  },
);

async function answer(url: string): Promise<string> {
  const response = await gate(new Request(url));
  return response.status === 403 ? "refused" : response.text();
}

verifies("sandbox-cloudflare-container.egress", () => {
  describe("outboundGate", () => {
    it("sends plain HTTP for the bridge's name to the bridge", async () => {
      expect(await answer("http://bridge.halonic.invalid/v1/messages")).toBe("bridge");
    });

    it("lets HTTPS to an allowed site out", async () => {
      expect(await answer("https://api.example.com/")).toBe("site");
      expect(await answer("https://REGISTRY.npmjs.org/acme")).toBe("site");
    });

    it("refuses everything else", async () => {
      expect(await answer("https://example.com/")).toBe("refused");
      expect(await answer("https://evil.test/")).toBe("refused");
      expect(await answer("http://api.example.com/")).toBe("refused");
      expect(await answer("https://bridge.halonic.invalid/")).toBe("refused");
      expect(await answer("http://bridge.halonic.invalid:8080/")).toBe("refused");
      expect(await answer("https://api.example.com:8443/")).toBe("refused");
      expect(await answer("https://example.com.evil.test/")).toBe("refused");
    });

    it("refuses the bridge's name for a run with no bridge", async () => {
      const noBridge = outboundGate(
        { bridgeHost: null, allowedSites: [] },
        {
          bridge: () => Promise.reject(new Error("unreachable")),
          site: () => Promise.reject(new Error("unreachable")),
        },
      );
      expect((await noBridge(new Request("http://bridge.halonic.invalid/"))).status).toBe(403);
    });
  });

  describe("siteAllowed", () => {
    it("matches a subdomain pattern only below the name", () => {
      expect(siteAllowed("a.b.example.com", ["*.example.com"])).toBe(true);
      expect(siteAllowed("example.com", ["*.example.com"])).toBe(false);
      expect(siteAllowed("badexample.com", ["*.example.com"])).toBe(false);
    });
  });
});
