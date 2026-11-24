import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type HandshakeOptions, handshakeRequest, openListener } from "./listener.test-helper.ts";

const tunnelName = "host.example.ts.net:8443";
const funnelHeader = "Tailscale-Funnel-Request";

/** The status line of the answer to one handshake through a tunnel name. */
async function statusOf(publicHeaders: string[], options: HandshakeOptions): Promise<string> {
  const t = await openListener({ extraHosts: [tunnelName], publicHeaders });
  try {
    const client = t.client();
    client.write(handshakeRequest(t.listener.port, { host: tunnelName, ...options }).text);
    const text = await client.until((seen) => seen.includes("\r\n"));
    return text.split("\r\n")[0] ?? "";
  } finally {
    await t.stop();
  }
}

verifies("remote-gateway.public-request", () => {
  describe("a request a tunnel marks as public", () => {
    it("is refused with 403 when its header is listed, in any case", async () => {
      expect(await statusOf([funnelHeader], { headers: [`${funnelHeader}: ?1`] })).toContain("403");
      expect(
        await statusOf(["tailscale-funnel-request"], { headers: ["TAILSCALE-FUNNEL-REQUEST: ?1"] }),
      ).toContain("403");
    });

    it("is refused before the path is looked at", async () => {
      expect(
        await statusOf([funnelHeader], { path: "/", headers: [`${funnelHeader}: ?1`] }),
      ).toContain("403");
    });

    it("leaves a request without the header alone", async () => {
      expect(await statusOf([funnelHeader], {})).toContain("101");
    });

    it("leaves the header alone when no public header is listed", async () => {
      expect(await statusOf([], { headers: [`${funnelHeader}: ?1`] })).toContain("101");
    });
  });
});
